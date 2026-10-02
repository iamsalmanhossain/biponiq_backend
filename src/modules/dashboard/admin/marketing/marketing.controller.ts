import { Request, Response } from "express";
import catchAsync from "../../../../shared/utils/catchAsync.js";
import { sendResponse } from "../../../../shared/utils/sendResponse.js";
import { AdminMarketingService } from "./marketing.service.js";
import { HttpStatusCode } from "axios";

const setUpPixel = catchAsync(async(req : Request,res : Response)=>{
    const adminId = req.user.id
    console.log(adminId)
    const result = await AdminMarketingService.saveAdminPixelCredentials(adminId,req.body)
    sendResponse(res,{
        statusCode:200,
        success:true,
        message:'Admin Pixel setup successfully',
        data:result
    })
})

const getAdminPixelCredentials = catchAsync(async(req:Request, res : Response)=>{
    const result = await AdminMarketingService.getAdminPixelCredentials()

    sendResponse(res, {
        statusCode: HttpStatusCode.Ok,
        success: true,
        message: 'Admin pixel credentials fetched successfully',
        data: result,
    })
})

const deleteAdminPixelCredentials = catchAsync(async(req : Request,res : Response)=>{
    const adminId = req.user.id
    const result = await AdminMarketingService.deleteAdminPixelCredentials(adminId)
    sendResponse(res,{
        statusCode:200,
        success:true,
        message:'Admin Pixel credentials deleted successfully',
        data:result
    })
})

export const AdminMarketingController = {
    setUpPixel,
    getAdminPixelCredentials,
    deleteAdminPixelCredentials
}