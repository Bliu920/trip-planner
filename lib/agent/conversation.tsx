"use client";

import { useState, type ReactNode } from "react";
import { Copy, Check, ThumbsUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";

// Adapted from shadcn AI Elements Chat, Message, and Suggestion patterns.
export function Conversation({ children }: { children: ReactNode }) {
  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="agent-conversation">
        <MessageScrollerViewport aria-label="Conversation" tabIndex={0}>
          <MessageScrollerContent className="agent-transcript">{children}</MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

export function AgentMessage({
  role = "assistant",
  children,
  copyText,
  onRetry,
  feedbackEnabled = true,
}: {
  role?: "user" | "assistant";
  children: ReactNode;
  copyText?: string;
  onRetry?: () => void;
  feedbackEnabled?: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const [liked, setLiked] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText ?? "");
      setFeedback("Copied");
    } catch {
      setFeedback("Copy unavailable. Select the reply to copy it.");
    }
  }
  return (
    <Message
      role="group"
      aria-label={role === "user" ? "Your message" : "Assistant response"}
      align={role === "user" ? "end" : "start"}
    >
      <MessageContent>
        <Bubble
          variant={role === "user" ? "muted" : "ghost"}
          align={role === "user" ? "end" : "start"}
        >
          <BubbleContent>{children}</BubbleContent>
        </Bubble>
        {copyText && (
          <div className="agent-message-actions">
            <Button
              className="cursor-pointer"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy reply"
              onClick={copy}
            >
              <Copy />
            </Button>
            {feedbackEnabled && (
              <Button
                className="cursor-pointer"
                variant="ghost"
                size="icon-sm"
                aria-label="Mark reply helpful"
                aria-pressed={liked}
                onClick={() => setLiked(!liked)}
              >
                {liked ? <Check /> : <ThumbsUp />}
              </Button>
            )}
            {onRetry && (
              <Button
                className="cursor-pointer"
                variant="ghost"
                size="icon-sm"
                aria-label="Regenerate reply"
                onClick={onRetry}
              >
                <RotateCcw />
              </Button>
            )}
            <span role="status">
              {feedback || (liked ? "Feedback recorded in this preview" : "")}
            </span>
          </div>
        )}
      </MessageContent>
    </Message>
  );
}

export function Suggestions({
  items,
  onSelect,
}: {
  items: string[];
  onSelect: (text: string) => void;
}) {
  return (
    <div className="agent-suggestions">
      {items.map((text) => (
        <Button key={text} variant="outline" onClick={() => onSelect(text)}>
          {text}
        </Button>
      ))}
    </div>
  );
}
