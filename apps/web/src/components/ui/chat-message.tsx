"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/springs";
import { useShape } from "@/lib/shape-context";
import { useIcon } from "@/lib/icon-context";
import { FileThumbnail } from "@/components/ui/file-thumbnail";

interface ChatMessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

interface ChatMessageProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  /** Who sent the message. Drives alignment and bubble colour:
   *  `user` → right-aligned accent bubble, `assistant` → left-aligned plain text. */
  from: "user" | "assistant";
  /** Optional attachments rendered as square thumbnails above the bubble. */
  files?: File[];
  /** Persisted chat attachments rendered above the bubble when `File` objects are no longer available. */
  attachments?: readonly ChatMessageAttachment[];
  /** Side length of each attachment thumbnail in pixels. Defaults to 64. */
  thumbnailSize?: number;
  /** Timestamp shown in the hover-revealed meta row, before the actions.
   *  User-message only — ignored on assistant replies. Caller pre-formats it
   *  (e.g. `"Wednesday 6:08 PM"`). */
  time?: ReactNode;
  /** Icon-only action buttons shown in the hover-revealed meta row (e.g. copy,
   *  edit, regenerate). Rendered next to the timestamp. */
  actions?: ReactNode;
  /** Message body. When omitted the text bubble is dropped (attachment-only message). */
  children?: ReactNode;
}

// ─── ChatMessage ──────────────────────────────────────────────────────────
// A single transcript entry with baked-in entrance + layout motion. Pairs with
// InputMessage's onSend: render one per sent/received message. `layout="position"`
// lets earlier messages slide up smoothly when a new one is appended.
const ChatMessage = forwardRef<HTMLDivElement, ChatMessageProps>(
  (
    { from, files, attachments, thumbnailSize = 64, time, actions, children, className, ...props },
    ref
  ) => {
    const shape = useShape();
    const isUser = from === "user";
    const showFileAttachments = files && files.length > 0;
    const showPersistedAttachments = attachments && attachments.length > 0;
    // Timestamps are a user-message affordance; assistant replies show actions only.
    const showTime = isUser && time != null;

    return (
      <motion.div
        ref={ref}
        layout="position"
        initial={{ opacity: 0, y: 8, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springs.moderate}
        style={{ transformOrigin: isUser ? "bottom right" : "bottom left" }}
        className={cn(
          "group flex max-w-[80%] flex-col gap-1.5",
          isUser ? "items-end self-end" : "items-start self-start",
          className
        )}
        {...props}
      >
        {(showFileAttachments || showPersistedAttachments) && (
          <div
            className={cn(
              "flex flex-wrap gap-1.5",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {files?.map((file, i) => (
              <FileThumbnail
                key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                file={file}
                size={thumbnailSize}
              />
            ))}
            {attachments?.map((attachment) => (
              <PersistedAttachmentThumbnail
                key={attachment.id}
                attachment={attachment}
                size={thumbnailSize}
              />
            ))}
          </div>
        )}
        {children != null && children !== "" && (
          <div
            className={cn(
              "py-2 text-[14px] break-words text-pretty",
              // User keeps the bubble chrome (rounded fill + horizontal padding);
              // the assistant reply is flush-left plain text with no background.
              isUser
                ? cn(
                    shape.bg,
                    "whitespace-pre-wrap px-3.5 bg-[color-mix(in_oklab,var(--accent),var(--background)_45%)] text-accent-foreground"
                  )
                : "whitespace-normal text-foreground"
            )}
          >
            {children}
          </div>
        )}
        {(showTime || actions != null) && (
          // Meta row: timestamp + icon-only actions. Always rendered (so it
          // reserves its height and the gap between bubbles never shifts) but
          // hidden until the message is hovered or an action is focused.
          // The timestamp is a user-message affordance only — assistant replies
          // show their actions alone. User rows read date → icons left-to-right.
          <div
            className={cn(
              "flex items-center gap-2 px-1 text-[12px] leading-none text-muted-foreground select-none",
              "opacity-0 pointer-events-none transition-opacity duration-150",
              "group-hover:opacity-100 group-hover:pointer-events-auto",
              "group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
            )}
          >
            {showTime && <span className="tabular-nums">{time}</span>}
            {actions != null && (
              <span className="flex items-center gap-0.5">{actions}</span>
            )}
          </div>
        )}
      </motion.div>
    );
  }
);

ChatMessage.displayName = "ChatMessage";

function PersistedAttachmentThumbnail({
  attachment,
  size,
}: {
  attachment: ChatMessageAttachment;
  size: number;
}) {
  const shape = useShape();
  const ImageIcon = useIcon("image");
  const PaperclipIcon = useIcon("paperclip");
  const Icon = attachment.mimeType.startsWith("image/") ? ImageIcon : PaperclipIcon;

  return (
    <div
      title={`${attachment.name} (${formatAttachmentSize(attachment.size)})`}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-1 border border-border/70 bg-background/70 p-1.5 text-muted-foreground shadow-sm",
        shape.bg
      )}
      style={{ width: size, height: size }}
    >
      <Icon size={18} />
      <span className="max-w-full truncate text-[10px] font-medium uppercase leading-none">
        {attachmentLabel(attachment)}
      </span>
    </div>
  );
}

function attachmentLabel(attachment: ChatMessageAttachment): string {
  const extension = attachment.name.split(".").pop();
  if (extension && extension !== attachment.name && extension.length <= 5) {
    return extension;
  }
  if (attachment.mimeType === "application/pdf") return "PDF";
  if (attachment.mimeType.startsWith("image/")) return "IMG";
  return "File";
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export { ChatMessage };
export type { ChatMessageProps };
export default ChatMessage;
