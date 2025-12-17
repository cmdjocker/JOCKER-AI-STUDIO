export interface BookMetadata {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
}

export interface PageDefinition {
  id: string;
  title: string;
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string; // base64 data uri
}

export interface BookPlan {
  metadata: BookMetadata;
  pages: { title: string; prompt: string }[];
}

export interface BookDimensions {
  width: number;
  height: number;
  unit: 'in' | 'px';
}

export interface GenerationState {
  step: 'input' | 'planning' | 'generating' | 'review';
  topic: string;
  dimensions: BookDimensions;
  metadata: BookMetadata | null;
  pages: PageDefinition[];
  coverImage?: string;
}