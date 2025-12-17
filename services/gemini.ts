import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { BookPlan } from "../types";

// Initialize Gemini Client
// @ts-ignore - process.env.API_KEY is guaranteed by the runtime environment per instructions
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const TEXT_MODEL = 'gemini-2.5-flash';
// Using general image model for speed and availability, prompting for line art
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

// Helper function to retry operations on 503 errors
async function withRetry<T>(operation: () => Promise<T>, retries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check for 503 Service Unavailable or "overloaded" messages
      const isOverloaded = 
        error.status === 503 || 
        error.code === 503 ||
        (error.message && (
          error.message.includes('503') || 
          error.message.toLowerCase().includes('overloaded') ||
          error.message.toLowerCase().includes('server error')
        ));

      if (isOverloaded && i < retries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Gemini API overloaded. Retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  throw lastError;
}

export const generateBookPlan = async (topic: string): Promise<BookPlan> => {
  const prompt = `
    You are an expert Amazon KDP publisher. Create a detailed plan for a children's coloring book about "${topic}".
    
    Return a JSON object with:
    1. A catchy, SEO-optimized Title.
    2. A compelling Subtitle.
    3. A persuasive Description for the Amazon product page.
    4. 7 high-reach SEO backend keywords (phrase match).
    5. A list of 20 distinct pages. For each page, provide:
       - "title": A short, fun, engaging title for the page.
       - "description": A distinct, fun, and visually descriptive scene prompt suitable for generating black and white coloring pages.
  `;

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
          keywords: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          pages: {
            type: Type.ARRAY,
            items: { 
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ["title", "description"]
            },
            description: "20 distinct pages with titles and descriptions"
          }
        },
        required: ["title", "subtitle", "description", "keywords", "pages"]
      }
    }
  }));

  const text = response.text;
  if (!text) throw new Error("No plan generated");
  
  const data = JSON.parse(text);
  
  return {
    metadata: {
      title: data.title,
      subtitle: data.subtitle,
      description: data.description,
      keywords: data.keywords,
    },
    pages: data.pages.map((p: any) => ({ title: p.title, prompt: p.description }))
  };
};

export const getClosestAspectRatio = (width: number, height: number): string => {
  const ratio = width / height;
  
  const supported = [
    { id: "1:1", val: 1.0 },
    { id: "3:4", val: 0.75 },
    { id: "4:3", val: 1.333 },
    { id: "9:16", val: 0.5625 },
    { id: "16:9", val: 1.777 }
  ];

  const closest = supported.reduce((prev, curr) => {
    return (Math.abs(curr.val - ratio) < Math.abs(prev.val - ratio) ? curr : prev);
  });

  return closest.id;
};

export const generateColoringPage = async (sceneDescription: string, aspectRatio: string = "3:4"): Promise<string> => {
  const prompt = `
    Generate a professional children's coloring book page. 
    Subject: ${sceneDescription}.
    Style: Clean black and white line art, crisp thick outlines, white background.
    Constraints: NO grayscale, NO shading, NO colors, NO complex textures. High contrast vector style.
  `;

  const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: prompt,
    config: {
      imageConfig: {
        aspectRatio: aspectRatio
      }
    }
  }));

  // Extract image from parts
  if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        // Convert to full data URI
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("No image generated in response");
};

export const generateCoverImage = async (topic: string, title: string, aspectRatio: string = "3:4"): Promise<string> => {
    const prompt = `
      A vibrant, colorful, and eye-catching book cover for a kids' coloring book.
      Title: "${title}".
      Theme: ${topic}.
      Style: Cartoonish, bright colors, inviting, professional typography.
      The text should be legible if possible, but primarily focus on a great main illustration.
    `;
  
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    }));
  
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
  
    throw new Error("No cover generated");
  };