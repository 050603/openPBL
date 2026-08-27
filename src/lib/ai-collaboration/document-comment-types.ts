export type DocumentAiComment = {
  id: string;
  role: 'student' | 'assistant';
  content: string;
  createdAt: string;
};

export type DocumentAiCommentThread = {
  id: string;
  blockId?: string;
  blockIndex: number;
  blockText?: string;
  targetText: string;
  issueType?: string;
  comments: DocumentAiComment[];
  createdAt: string;
  readAt?: string;
  reviewVersion?: number;
};

export type DocumentAiCommentSuggestion = {
  operation: 'replace';
  title: string;
  targetText: string;
  replacement: string;
  reason: string;
};

export type DocumentAiCommentReplyResult = {
  kind: 'discussion' | 'edit-suggestion' | 'boundary';
  message: string;
  suggestion?: DocumentAiCommentSuggestion;
};

export type DocumentBlockCandidate = {
  blockId?: string;
  blockIndex: number;
  type: string;
  text: string;
};
