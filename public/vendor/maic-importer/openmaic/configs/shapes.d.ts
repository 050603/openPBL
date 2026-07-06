import { ShapePathFormulasKeys } from '@openmaic/dsl';
export interface ShapePoolItem {
    viewBox: [number, number];
    path: string;
    special?: boolean;
    pathFormula?: ShapePathFormulasKeys;
    outlined?: boolean;
    pptxShapeType?: string;
    title?: string;
    withborder?: boolean;
}
interface ShapeListItem {
    type: string;
    children: ShapePoolItem[];
}
export interface ShapePathFormula {
    editable?: boolean;
    defaultValue?: number[];
    range?: [number, number][];
    relative?: string[];
    getBaseSize?: ((width: number, height: number) => number)[];
    formula: (width: number, height: number, values?: number[]) => string;
}
export declare const SHAPE_PATH_FORMULAS: Record<string, ShapePathFormula>;
export declare const SHAPE_LIST: ShapeListItem[];
export {};
