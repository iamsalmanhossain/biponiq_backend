/* eslint-disable @typescript-eslint/no-unused-vars */
import { Prisma } from '@prisma/client'
import type { NextFunction, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { ZodError } from 'zod'
import { env } from '../config/env.js'
import AppError from '../shared/errors/AppError.js'

const globalErrorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
  let statusCode = err.statusCode || 500

  // Include `code` only when the error is explicitly one of our own AppError instances
  // and carries a non-empty stable code. This prevents any external error class
  // (Prisma PrismaClientKnownRequestError, Node.js SystemError, JWT errors, etc.)
  // from accidentally leaking its internal `.code` property to the client.
  const appErrorCode =
    err instanceof AppError &&
    typeof err.code === 'string' &&
    err.code.length > 0
      ? err.code
      : undefined

  const errorResponse: any = {
    success: false,
    message: err.message || 'Something went wrong',
    statusCode,
    ...(appErrorCode !== undefined ? { code: appErrorCode } : {}),
  }

  // ------------------HANDLE ZOD VALIDATION ERRORS---------------
  if (err instanceof ZodError) {
    statusCode = StatusCodes.BAD_REQUEST
    errorResponse.message = 'Validation error'
    errorResponse.errors = err.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }))
  }

  // ------------------HANDLE KNOWN PRISMA CLIENT ERRORS---------------
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P1000':
        errorResponse.message = 'Authentication failed against the database server.'
        statusCode = StatusCodes.BAD_GATEWAY
        break
      case 'P1001':
        errorResponse.message = 'Cannot reach the database server. Please check connection.'
        statusCode = StatusCodes.BAD_GATEWAY
        break
      case 'P1002':
        errorResponse.message = 'The database operation timed out.'
        statusCode = StatusCodes.REQUEST_TIMEOUT
        break
      case 'P2000':
        errorResponse.message = 'Value too long for a database column.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2001':
        errorResponse.message = 'Record not found.'
        statusCode = StatusCodes.NOT_FOUND
        break
      case 'P2002':
        errorResponse.message = 'Duplicate key error — unique constraint failed.'
        statusCode = StatusCodes.CONFLICT
        break
      case 'P2003':
        errorResponse.message = 'Foreign key constraint failed.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2004':
        errorResponse.message = 'Database constraint failed.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2005':
        errorResponse.message = 'Invalid value stored in the database.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2006':
        errorResponse.message = 'Invalid value type provided for the field.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2007':
        errorResponse.message = 'Data validation error.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2008':
        errorResponse.message = 'Query parsing failed.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2009':
        errorResponse.message = 'Query validation failed.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2010':
        errorResponse.message = 'Raw query failed. Check your query syntax.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2011':
        errorResponse.message = 'Null constraint violation — missing required field.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2012':
        errorResponse.message = 'Missing required value for a field.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2013':
        errorResponse.message = 'Missing required argument for a field.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2014':
        errorResponse.message = 'Relation violation between records.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2015':
        errorResponse.message = 'Related record not found.'
        statusCode = StatusCodes.NOT_FOUND
        break
      case 'P2016':
        errorResponse.message = 'Query interpretation error.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2017':
        errorResponse.message = 'Record relation inconsistency.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2018':
        errorResponse.message = 'Required connected record not found.'
        statusCode = StatusCodes.NOT_FOUND
        break
      case 'P2019':
        errorResponse.message = 'Input error — invalid data.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2020':
        errorResponse.message = 'Value out of range for the column type.'
        statusCode = StatusCodes.BAD_REQUEST
        break
      case 'P2021':
        errorResponse.message = 'Table not found in the database.'
        statusCode = StatusCodes.NOT_FOUND
        break
    }
  }

  if (env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack
    errorResponse.error = err
  }

  // শুধুমাত্র 5xx server error গুলো log করা হয়
  // 4xx client error (404, 401, 400, etc.) expected behavior, তাই log করার দরকার নেই
  if (statusCode >= 500) {
    console.error('[Global Error Handler] Server Error:', err);
  }

  res.status(statusCode).json(errorResponse)
}

export default globalErrorHandler
