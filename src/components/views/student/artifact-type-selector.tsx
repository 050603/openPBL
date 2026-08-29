"use client";

import { ChevronDown, Code2, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  artifactTypeLabel,
  COLLABORATION_ARTIFACT_TYPES,
  type CollaborationArtifactType,
} from "@/lib/ai-collaboration/artifact-types";

export function ArtifactTypeSelector({
  value,
  onValueChange,
}: {
  value: CollaborationArtifactType;
  onValueChange: (value: CollaborationArtifactType) => void;
}) {
  const Icon = value === "document" ? FileText : Code2;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`成果类型：${artifactTypeLabel(value)}`}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 sm:px-3"
          type="button"
        >
          <Icon aria-hidden="true" size={15} />
          <span className="hidden text-xs text-stone-500 sm:inline">成果类型</span>
          <span>{artifactTypeLabel(value)}</span>
          <ChevronDown aria-hidden="true" className="text-stone-400" size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-white p-1.5" sideOffset={8}>
        <DropdownMenuLabel className="px-2 pb-1 pt-1.5 text-xs font-medium text-stone-500">
          选择当前制作的成果
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => onValueChange(nextValue as CollaborationArtifactType)}
          value={value}
        >
          {COLLABORATION_ARTIFACT_TYPES.map((item) => {
            const ItemIcon = item.value === "document" ? FileText : Code2;
            return (
              <DropdownMenuRadioItem
                className="items-start gap-2.5 rounded-md py-2.5 pl-8 pr-2 focus:bg-stone-100"
                key={item.value}
                value={item.value}
              >
                <ItemIcon aria-hidden="true" className="mt-0.5 text-stone-500" size={15} />
                <span className="min-w-0">
                  <span className="block font-medium text-stone-900">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-stone-500">{item.description}</span>
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
