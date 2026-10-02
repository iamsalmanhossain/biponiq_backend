export interface CreateDocumentationDto {
  title: string;
  titleBn?: string;
  category: string;
  descriptionSteps: string[]; // replaces description
  descriptionStepsBn?: string[];
  isPublished?: boolean;
  images?: string[];
  redirectUrl?: string;
}

export interface UpdateDocumentationDto {
  title?: string;
  titleBn?: string;
  category?: string;
  descriptionSteps?: string[];
  descriptionStepsBn?: string[];
  isPublished?: boolean;
  images?: string[];
  redirectUrl?: string;
}
