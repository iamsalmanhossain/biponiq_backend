import { prisma } from "../../../../lib/prisma.js";
import { AdminPixelPayload } from "./marketing.interface.js";

const saveAdminPixelCredentials = async (adminId:string, payload:AdminPixelPayload) =>{
    const result = await prisma.admin.update({
        where:{
            userId:adminId
        },
        data:{
           pixelId : payload.pixelId,
           pixelAccessToken : payload.pixelAccessToken,
           pixelTestCode: payload.pixelTestCode || null,
            
        }
    })
    
    return result
}

const getAdminPixelCredentials = async ()=>{
    const result = await prisma.admin.findFirst({
 
 select:{
    id:true,
    pixelId:true,
    pixelAccessToken:true,
    pixelTestCode:true
 }
    })   
    return result
}

const deleteAdminPixelCredentials = async (adminId : string)=>{
const result = await prisma.admin.update({
    where :{
        userId:adminId
    }, 
    data :{
        pixelId : null,
        pixelAccessToken : null,
        pixelTestCode : null
    }
})

return result
}
export const AdminMarketingService = {
    saveAdminPixelCredentials,
    getAdminPixelCredentials,
    deleteAdminPixelCredentials
}