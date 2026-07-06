import { parse as parsePptxDefault } from 'pptxtojson';
import type { ImportContext, TransformResult } from './types';
type ParsedPptxJson = Awaited<ReturnType<typeof parsePptxDefault>>;
export declare function transformParsedToSlides(json: ParsedPptxJson, ctx: ImportContext): Promise<TransformResult>;
export {};
