// @ts-nocheck
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { BookPlan } from "../types";

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 6, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorCode = (error as any).status || (error as any).code || (error as any).error?.code;
      const errorMessage = (error.message || JSON.stringify(error)).toLowerCase();

      const isRateLimited = errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota');
      const isOverloaded = errorCode === 503 || errorMessage.includes('503') || errorMessage.includes('overloaded');

      if (isRateLimited || isOverloaded) {
        if (i < maxRetries - 1) {
            const delay = Math.max(1000, (initialDelay * Math.pow(2, i)) + (Math.random() * 500));
            console.warn(`API Rate limit or overload. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
      }
      console.error("API Permanent Error:", errorMessage);
      throw error;
    }
  }
  throw lastError;
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateBookPlan = async (topic: string): Promise<BookPlan> => {
  const prompt = `
    You are a professional Amazon KDP strategist. Create a plan for a niche children's coloring book about "${topic}".
    The target is "High Reach SEO" for Kindle/KDP.
    
    Requirements:
    - GENERATE EXACTLY 20 UNIQUE PAGES in the pages array.
    - Title should be keyword rich (e.g. "Space Cats Coloring Book for Kids Ages 4-8").
    - Subtitle should highlight benefits (e.g. "Unique Hand-Drawn Pages to Boost Creativity").
    - Backend keywords must be high-traffic, competitive-niche phrases.
    - Pages must be fun, simple enough for kids to color, but interesting enough for parents to buy.
    
    Return JSON exactly matching the schema.
  `;

  const ai = getAI();
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          description: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          pages: {
            type: Type.ARRAY,
            minItems: 20,
            maxItems: 20,
            items: { 
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["title", "description"]
            }
          }
        },
        required: ["title", "subtitle", "description", "keywords", "pages"]
      }
    }
  }));

  const data = JSON.parse(response.text || '{}');
  return {
    metadata: {
      title: data.title || '',
      subtitle: data.subtitle || '',
      description: data.description || '',
      keywords: data.keywords || [],
    },
    pages: (data.pages || []).map((p: any) => ({ title: p.title || '', prompt: p.description || '' }))
  };
};

export const getClosestAspectRatio = (width: number, height: number): string => {
  const ratio = width / height;
  const supported = [{ id: "1:1", val: 1.0 }, { id: "3:4", val: 0.75 }, { id: "4:3", val: 1.333 }, { id: "9:16", val: 0.5625 }, { id: "16:9", val: 1.777 }];
  return supported.reduce((prev, curr) => (Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev)).id;
};

export const generateColoringPage = async (sceneDescription: string, aspectRatio: string = "3:4"): Promise<string> => {
  const prompt = `
    Children's coloring book page: ${sceneDescription}.
    Style: Professional hand-drawn black and white line art, thick outlines, high contrast.
    Format: Pure white background ONLY, NO shading, NO colors, NO grayscale, NO textures. 
    Large print simple subjects. KDP interior compatible.
  `;

  const ai = getAI();
  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: { imageConfig: { aspectRatio: aspectRatio as any } }
  }));

  const parts = response.candidates?.[0]?.content?.parts;
  if (parts) {
    for (const part of parts) {
      if (part.inlineData?.data) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }
  throw new Error("API response did not contain image data.");
};

export const generateCoverImage = async (topic: string, title: string, aspectRatio: string = "3:4"): Promise<string> => {
    const prompt = `
      Front cover illustration for a children's coloring book about: "${topic}".
      Style: Vibrant, cartoonish, 3D render look, eye-catching bright colors.
      Inviting and professional. DO NOT INCLUDE TEXT on the illustration itself.
    `;
  
    const ai = getAI();
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: { imageConfig: { aspectRatio: aspectRatio as any } }
    }));
  
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("API response did not contain cover image data.");
};
