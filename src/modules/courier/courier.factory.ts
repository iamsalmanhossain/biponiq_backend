import { CourierProvider } from '@prisma/client'
import { BaseCourier } from './base.js'
import { SteadfastCourier } from './steadfast.js'
import { RedXCourier } from './redx.js'
import { PathaoCourier } from './pathao.js'
import { CarryBeeCourier } from './carrybee.js'

export class CourierFactory {
  static getCourierInstance(
    provider: CourierProvider,
    credentials: Record<string, any>
  ): BaseCourier {
    switch (provider) {
      case CourierProvider.STEADFAST:
        return new SteadfastCourier(credentials)

      case CourierProvider.REDX:
        return new RedXCourier(credentials)

      case CourierProvider.PATHAO:
        return new PathaoCourier(credentials)

      case CourierProvider.CARRYBEE:
        return new CarryBeeCourier(credentials)

      case CourierProvider.COURIER_BD:
        throw new Error(
          `Courier service ${provider} is not implemented yet.`
        )

      default:
        throw new Error(`Unsupported courier provider: ${provider}`)
    }
  }
}
