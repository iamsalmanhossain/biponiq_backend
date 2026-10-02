import { Request, Response } from "express";
import { aiChatBootService } from "./aiChatBot.service.js";


const handleUserMessage = async (req:Request, res:Response) => {
    try {
        const { message, history } = req.body;
        
        // বেসিক ভ্যালিডেশন
        if (!message || typeof message !== 'string' || message.trim() === '') {
            return res.status(400).json({ success: false, message: "সঠিক মেসেজ ফরম্যাট প্রয়োজন।" });
        }

        // সার্ভিসকে কল করা (হিস্ট্রি না থাকলে এম্পটি অ্যারে যাবে)
        const reply = await aiChatBootService.getChatbotResponse(message, history || []);
        
        return res.status(200).json({ success: true, reply });
    } catch (error) {
        console.error("[Chat Controller Error]:", error);
        return res.status(500).json({ success: false, message: "সার্ভার এই মুহূর্তে ব্যস্ত আছে। কিছুক্ষণ পর চেষ্টা করুন।" });
    }
};

export const aiChatBootController = {
    handleUserMessage
}