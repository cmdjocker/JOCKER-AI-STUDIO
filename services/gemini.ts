// @ts-nocheck
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { BookPlan } from "../types";

const TEXT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 12, initialDelay = 6000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      const errorCode = (error as any).status || (error as any).code || (error as any).error?.code;
      const errorMessage = (error.message || JSON.stringify(error)).toLowerCase();

      const isRateLimited = errorCode === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('resource_exhausted');
      const isOverloaded = errorCode === 503 || errorMessage.includes('503') || errorMessage.includes('overloaded');

      if (isRateLimited || isOverloaded) {
        if (i < maxRetries - 1) {
            // Exponential backoff with significant jitter
            const delay = (initialDelay * Math.pow(1.6, i)) + (Math.random() * 2000);
            console.warn(`[KDP Studio] Quota limit/Busy. Retry ${i+1}/${maxRetries} in ${Math.round(delay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateBookPlan = async (topic: string): Promise<BookPlan> => {
  const prompt = `
    Professional Amazon KDP Strategist:
    Create a detailed plan for a children's coloring book about "${topic}".
    Target: High-Reach SEO for Amazon.
    Generate EXACTLY 20 unique page titles and detailed drawing prompts.
    Return JSON only.
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
    KDP Interior Drawing: ${sceneDescription}.
    Style: Hand-drawn black and white line art coloring page. 
    Instructions: High contrast, thick outlines, white background, no shading, no gray, no textures. 
    Professional professional children's coloring book style.
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
  throw new Error("No image data returned from AI.");
};

export const generateCoverImage = async (topic: string, title: string, aspectRatio: string = "3:4"): Promise<string> => {
    const prompt = `Book cover for coloring book: ${topic}. Digital art, vivid colors, 3D render style, kid-friendly.`;
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
    throw new Error("No cover image returned.");
};