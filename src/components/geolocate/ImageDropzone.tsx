"use client";

import { useRef } from "react";
import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  preview: string | null;
  fileName: string | null;
  disabled?: boolean;
  onSelect: (file: File | null) => void;
}

export function ImageDropzone({ preview, fileName, disabled, onSelect }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSelect(e.dataTransfer.files?.[0] ?? null);
      }}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center transition-colors hover:border-primary/60",
        preview ? "py-4" : "py-10",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
      />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={fileName ?? "image preview"}
          className="max-h-56 max-w-full rounded-lg object-contain"
        />
      ) : (
        <>
          <ImageUp className="size-8 text-muted-foreground" strokeWidth={1.5} />
          <div className="text-sm">
            Drop an image here or <span className="text-primary">browse</span>
          </div>
        </>
      )}
    </div>
  );
}
