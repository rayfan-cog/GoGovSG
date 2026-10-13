import { NextFunction, Request, Response } from 'express'
import { inject, injectable } from 'inversify'

import dogstatsd, {
  MALICIOUS_ACTIVITY_LINK,
  SCAN_FAILED_LINK,
} from '../../util/dogstatsd.js'
import jsonMessage from '../../util/json.js'
import { UrlCreationRequest } from '../user/index.js'
import { UrlThreatScanService } from './interfaces/index.js'
import { DependencyIds } from '../../constants.js'
import { logger } from '../../config.js'

export const SCAN_FAILED_MESSAGE =
  'Error checking link, please try again. If the error persists, please contact us.'

@injectable()
export class UrlCheckController {
  private urlThreatScanService: UrlThreatScanService

  public constructor(
    @inject(DependencyIds.urlThreatScanService)
    urlThreatScanService: UrlThreatScanService,
  ) {
    this.urlThreatScanService = urlThreatScanService
  }

  // Scan errors may embed the Web Risk API key (e.g. in a FetchError's
  // request URL), so only a fixed message is returned to the client.
  private static handleScanFailure(error: unknown, res: Response): void {
    dogstatsd.increment(SCAN_FAILED_LINK, 1, 1)
    logger.error(error)
    res.serverError(jsonMessage(SCAN_FAILED_MESSAGE))
  }

  singleUrlCheck: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void> = async (req, res, next) => {
    const { shortUrl, longUrl }: UrlCreationRequest = req.body

    if (longUrl) {
      try {
        const isThreat = await this.urlThreatScanService.isThreat(longUrl)
        if (isThreat) {
          const user = req.session?.user
          logger.warn(
            `Malicious link attempt: User ${
              user?.email || user?.id
            } tried to link ${shortUrl} to ${longUrl}`,
          )
          dogstatsd.increment(MALICIOUS_ACTIVITY_LINK, 1, 1)
          res.badRequest(
            jsonMessage(
              'Link is likely to be malicious, please contact us for further assistance',
            ),
          )
          return
        }
      } catch (error) {
        UrlCheckController.handleScanFailure(error, res)
        return
      }
    }
    next()
  }

  bulkUrlCheck: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void> = async (req, res, next) => {
    const { longUrls }: { longUrls: string[] } = req.body

    if (longUrls) {
      try {
        const isThreat = await this.urlThreatScanService.isThreatBulk(longUrls)
        if (isThreat) {
          const user = req.session?.user
          logger.warn(
            `Malicious link attempt: User ${
              user?.email || user?.id
            } tried to create a malicious url via bulk upload`,
          )
          res.badRequest(
            jsonMessage(
              'Csv contains a link that is likely to be malicious, please contact us for further assistance',
            ),
          )
          return
        }
      } catch (error) {
        UrlCheckController.handleScanFailure(error, res)
        return
      }
    }
    next()
  }
}

export default UrlCheckController
