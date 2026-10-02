import { env } from "../../config/env.js";
import { GoogleGenAI } from '@google/genai';
// আপনার Subscription সার্ভিসটি ইম্পোর্ট করে নিন
import { SubscriptionService } from '../subscription/subscription.service.js';
// স্ট্যাটিক ডেটা ফাইলটি ইম্পোর্ট করে নিন
import { BiponiqKnowledgeBase } from './aiChatBot.knowledge.js';
import redis from "../../config/redis.config.js";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const getChatbotResponse = async (userMessage: string, chatHistory: { text: string }[] = []) => {
    try {
        // ==========================================
        // ১. ডেটাবেস থেকে লাইভ প্রাইসিং প্ল্যানগুলো ফেচ করা
        // ==========================================
        // const activePlans = await SubscriptionService.getActivePlansForVendor();
        const cacheKey = 'chatbot:active_plans'
        let activePlans

        const cachedPlans = await redis.get(cacheKey)
        if(cachedPlans){
            activePlans = JSON.parse(cachedPlans)
        }else{
            activePlans = await SubscriptionService.getActivePlansForVendor();
           if(activePlans && activePlans.length > 0){
            await redis.set(cacheKey, JSON.stringify(activePlans), 'EX', 2592000) // 1 month
           }
        }

        // ==========================================
        // ২. প্ল্যানগুলোকে রিডেবল টেক্সট স্ট্রিংয়ে সাজানো
        // ==========================================
        // activePlans এর ভেতরে prices অ্যারে থাকে (যেমন: Monthly, Yearly)
        const plansContext = activePlans.map((plan:any) => {
            const pricesText = plan.prices.map((p:any) => `${p.billingCycle}: ৳${p.price}`).join(', ');
            return `- ${plan.name} Plan: ${pricesText}`;
        }).join('\n');

        // ==========================================
        // ৩. স্ট্রিক্ট সিস্টেম ইনস্ট্রাকশন সেট করা
        // ==========================================
        const systemInstruction = `
        তুমি "Biponiq" প্ল্যাটফর্মের কাস্টমার সাপোর্ট বট। Biponiq হলো একটি ল্যান্ডিং পেজ প্রোভাইডার। 
        
        === ওয়েবসাইটের বর্তমান ডেটা ===
        অ্যাক্টিভ প্রাইসিং প্ল্যানসমূহ:
        ${plansContext}
        
        সাধারণ তথ্য:
        ${BiponiqKnowledgeBase.publicInfo}

        সাধারণ জিজ্ঞাসা (FAQ):
        ${BiponiqKnowledgeBase.faq.map(f => `প্র: ${f.question}\nউ: ${f.answer}`).join('\n\n')}
        
        গোপনীয়তা নীতি (Privacy Policy):
        ${BiponiqKnowledgeBase.privacyPolicy}
        
        শর্তাবলী ও নিয়মাবলি (Terms and Conditions):
        ${BiponiqKnowledgeBase.termsAndConditions}
        
        রিফান্ড পলিসি (Refund Policy):
        ${BiponiqKnowledgeBase.refundPolicy}
        
        === রুলস (অবশ্যই মানতে হবে) ===
        ${BiponiqKnowledgeBase.rules}
        `;

        // ==========================================
        // ৪. চ্যাট হিস্ট্রি সাজানো
        // ==========================================
        const contents = chatHistory.map(msg => ({
            role: 'user',
            parts: [{ text: msg.text }]
        }));
        
        contents.push({
            role: 'user',
            parts: [{ text: userMessage }]
        });

        // ==========================================
        // ৫. AI API কল
        // ==========================================
        const response = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents: contents,
            config: { 
                systemInstruction: systemInstruction,
                temperature: 0.1, // মনগড়া কথা বলা (Hallucination) ঠেকাতে 0.1 ব্যবহার করা হয়েছে
                maxOutputTokens: 2000 
            }
        });

        return response.text;
    } catch (error: any) {
        console.error("[AI ChatBot Error]:", error);
        throw new Error(`AI Gen Error: ${error.message}`);
    }
};

export const aiChatBootService = {
    getChatbotResponse
}
