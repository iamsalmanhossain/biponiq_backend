import express, { Router } from "express";
import { apiLimiter } from "../../middleware/rateLimit.js";
import { aiChatBootController } from "./aiChatBot.controller.js";


const router:Router= express.Router(); 

router.post('/',apiLimiter, aiChatBootController.handleUserMessage)

export const AichatbootRoute = router