export interface BookMetadata {
  title: string;
  subtitle: string;
  description: string;
  authorName: string;
  keywords: string[];
}

export interface PageDefinition {
  id: string;
  title: string;
  prompt: string;
  saying?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string; // base64 data uri
}

export interface BookPlan {
  metadata: BookMetadata;
  pages: { title: string; prompt: string; saying: string }[];
}

export interface BookDimensions {
  width: number;
  height: number;
  unit: 'in' | 'px';
}

export type ViewType = 'home' | 'login' | 'register' | 'vip' | 'canva';

export interface GenerationState {
  view: ViewType;
  step: 'input' | 'planning' | 'generating' | 'review';
  topic: string;
  targetAge: string;
  dimensions: BookDimensions;
  metadata: BookMetadata | null;
  pages: PageDefinition[];
  coverImage?: string; // Front cover base64
  backCoverImage?: string; // Back cover base64
  uploadedCoverFile?: File;
  coverSource: 'generated' | 'uploaded' | 'none';
}