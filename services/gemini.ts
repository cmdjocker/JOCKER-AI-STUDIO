// @ts-nocheck
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { BookPlan, BookDimensions } from "../types";

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
            const delay = (initialDelay * Math.pow(1.6, i)) + (Math.random() * 2000);
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

/**
 * Analyzes an uploaded template to extract KDP obligations and dimensions
 */
export const analyzeCoverTemplate = async (imageBase64: string): Promise<Partial<BookDimensions>> => {
    const ai = getAI();
    const data = imageBase64.split(',')[1];
    const mimeType = imageBase64.split(';')[0].split(':')[1];
    
    const prompt = `
        Analyze this KDP cover template image. 
        Extract the intended Width and Height (usually in inches).
        Identify if there is a spine area.
        Return ONLY a JSON object: {"width": number, "height": number, "hasSpine": boolean}.
    `;

    const response = await withRetry(() => ai.models.generateContent({
        model: TEXT_MODEL,
        contents: {
            parts: [
                { inlineData: { data, mimeType } },
                { text: prompt }
            ]
        },
        config: { responseMimeType: "application/json" }
    }));

    try {
        return JSON.parse(response.text);
    } catch (e) {
        return {};
    }
};

export const generateBookPlan = async (topic: string, targetAge: string): Promise<BookPlan> => {
  const prompt = `
    Professional Amazon KDP Strategist:
    Create a detailed plan for a children's coloring book for target age "${targetAge}" about "${topic}".
    Target: High-Reach SEO for Amazon.
    The content MUST be age-appropriate for ${targetAge} year olds.
    Generate EXACTLY 20 unique page titles, detailed drawing prompts, and a cute/adorable short saying for each page.
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
          authorName: { type: Type.STRING },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          pages: {
            type: Type.ARRAY,
            minItems: 20,
            maxItems: 20,
            items: { 
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    saying: { type: Type.STRING }
                },
                required: ["title", "description", "saying"]
            }
          }
        },
        required: ["title", "subtitle", "description", "authorName", "keywords", "pages"]
      }
    }
  }));

  const data = JSON.parse(response.text || '{}');
  return {
    metadata: {
      title: data.title || '',
      subtitle: data.subtitle || '',
      description: data.description || '',
      authorName: data.authorName || 'KDP Creator',
      keywords: data.keywords || [],
    },
    pages: (data.pages || []).map((p: any) => ({ 
      title: p.title || '', 
      prompt: p.description || '',
      saying: p.saying || ''
    }))
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
    Instructions: High contrast, thick outlines, white background, no shading. 
    Professional children's coloring book style.
  `;
  const ai = getAI();
  const response = await withRetry(() => ai.models.generateContent({
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
  throw new Error("No image data returned.");
};

export const generateCoverImage = async (topic: string, title: string, subtitle: string, author: string, aspectRatio: string = "3:4", isBack: boolean = false, referenceImageBase64?: string): Promise<string> => {
    const ai = getAI();
    let textPrompt = isBack 
        ? `Back cover for a children's coloring book about "${topic}". Must include space for a barcode, an adorable character illustration, and a short blurb: "${subtitle}". Style must match a professional KDP cover.`
        : `Front cover for a children's coloring book about "${topic}". Main Title: "${title}". Author: "${author}". Vibrant, high-detail illustration, commercial appeal.`;

    if (referenceImageBase64) {
      textPrompt += ` CRITICAL: Respect the structure, dimensions, and layout obligations of the provided reference template EXACTLY.`;
    }

    const contents = { parts: [{ text: textPrompt }] };
    if (referenceImageBase64) {
      const data = referenceImageBase64.split(',')[1];
      const mimeType = referenceImageBase64.split(';')[0].split(':')[1];
      contents.parts.unshift({ inlineData: { data, mimeType } });
    }

    const response = await withRetry(() => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents,
      config: { imageConfig: { aspectRatio: aspectRatio as any } }
    }));

    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData?.data) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Generation failed.");
};