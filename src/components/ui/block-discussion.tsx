'use client';

import * as React from 'react';

import type { PlateElementProps, RenderNodeWrapper } from 'platejs/react';

import { getDraftCommentKey } from '@platejs/comment';
import { CommentPlugin } from '@platejs/comment/react';
import { getTransientSuggestionKey } from '@platejs/suggestion';
import { SuggestionPlugin } from '@platejs/suggestion/react';
import {
  MessageSquareTextIcon,
  MessagesSquareIcon,
  PencilLineIcon,
} from 'lucide-react';
import { type AnyPluginConfig, type NodeEntry, PathApi } from 'platejs';
import { useEditorRef, usePluginOption } from 'platejs/react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { commentPlugin } from '@/components/editor/plugins/comment-kit';
import {
  discussionPlugin,
  type TDiscussion,
} from '@/components/editor/plugins/discussion-kit';
import { useBlockDiscussionItems } from '@/lib/block-discussion-index';
import { suggestionPlugin } from '@/components/editor/plugins/suggestion-kit';
import { cn } from '@/lib/utils';

import {
  BlockSuggestionCard,
  isResolvedSuggestion,
  PendingAiCommentSuggestionCard,
} from './block-suggestion';
import { Comment, CommentCreateForm } from './comment';

export const BlockDiscussion: RenderNodeWrapper<AnyPluginConfig> = ({ key, ...props }) =>
  function BlockDiscussionNodeWrapper({ children }) {
    return (
      <BlockCommentContent key={key} {...props}>{children}</BlockCommentContent>
    );
  };

const BlockCommentContent = ({ children, element }: PlateElementProps) => {
  const editor = useEditorRef();
  const commentsApi = editor.getApi(CommentPlugin).comment;
  const blockPath = editor.api.findPath(element) ?? [];
  const isTopLevelBlock = blockPath.length === 1;
  const draftCommentNode = isTopLevelBlock
    ? commentsApi.node({ at: blockPath, isDraft: true })
    : undefined;
  const commentNodes = isTopLevelBlock
    ? [...commentsApi.nodes({ at: blockPath })]
    : [];
  const suggestionNodes = isTopLevelBlock
    ? [
        ...editor.getApi(SuggestionPlugin).suggestion.nodes({ at: blockPath }),
      ].filter(([node]) => !node[getTransientSuggestionKey()])
    : [];
  const { resolvedDiscussions, resolvedSuggestions } =
    useBlockDiscussionItems(blockPath);

  const suggestionsCount = resolvedSuggestions.length;
  const discussionsCount = resolvedDiscussions.length;
  const unreadDiscussions = resolvedDiscussions.filter(
    (discussion) => discussion.source === 'ai-proactive' && discussion.isUnread
  );
  const hasUnreadDiscussion = unreadDiscussions.length > 0;
  const totalCount = suggestionsCount + discussionsCount;

  const activeSuggestionId = usePluginOption(suggestionPlugin, 'activeId');
  const activeSuggestion =
    activeSuggestionId &&
    resolvedSuggestions.find((s) => s.suggestionId === activeSuggestionId);

  const commentingBlock = usePluginOption(commentPlugin, 'commentingBlock');
  const activeCommentId = usePluginOption(commentPlugin, 'activeId');
  const isCommenting = activeCommentId === getDraftCommentKey();
  const activeDiscussion =
    activeCommentId &&
    resolvedDiscussions.find((d) => d.id === activeCommentId);

  const noneActive = !activeSuggestion && !activeDiscussion;

  const sortedMergedData = [
    ...resolvedDiscussions,
    ...resolvedSuggestions,
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const selected =
    resolvedDiscussions.some((d) => d.id === activeCommentId) ||
    resolvedSuggestions.some((s) => s.suggestionId === activeSuggestionId);

  const [_open, setOpen] = React.useState(selected);
  const readRequestedRef = React.useRef(new Set<string>());
  const onAiRead = usePluginOption(discussionPlugin, 'onAiRead');

  // in some cases, we may comment the multiple blocks
  const commentingCurrent =
    !!commentingBlock && PathApi.equals(blockPath, commentingBlock);

  const open =
    _open ||
    selected ||
    (isCommenting && !!draftCommentNode && commentingCurrent);

  React.useEffect(() => {
    if (!open || !onAiRead) return;
    unreadDiscussions.forEach((discussion) => {
      const latestCommentId = discussion.comments.at(-1)?.id ?? 'empty';
      const requestKey = `${discussion.id}:${latestCommentId}`;
      if (readRequestedRef.current.has(requestKey)) return;
      readRequestedRef.current.add(requestKey);
      void onAiRead({ discussionId: discussion.id });
    });
  }, [onAiRead, open, unreadDiscussions]);

  const anchorElement = React.useMemo(() => {
    let activeNode: NodeEntry | undefined;

    if (activeSuggestion) {
      activeNode = suggestionNodes.find(
        ([node]) =>
          editor.getApi(SuggestionPlugin).suggestion.nodeId(node) ===
          activeSuggestion.suggestionId
      );
    }

    if (activeCommentId) {
      if (activeCommentId === getDraftCommentKey()) {
        activeNode = draftCommentNode;
      } else {
        activeNode = commentNodes.find(
          ([node]) =>
            editor.getApi(commentPlugin).comment.nodeId(node) ===
            activeCommentId
        );
      }
    }

    if (!activeNode) return null;

    return editor.api.toDOMNode(activeNode[0])!;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    activeSuggestion,
    activeCommentId,
    editor.api,
    suggestionNodes,
    draftCommentNode,
    commentNodes,
  ]);

  if (!isTopLevelBlock) return <>{children}</>;

  if (suggestionsCount + resolvedDiscussions.length === 0 && !draftCommentNode)
    return <div className="w-full">{children}</div>;

  return (
    <div className="flex w-full justify-between">
      <Popover
        open={open}
        onOpenChange={(_open_) => {
          if (!_open_ && isCommenting && draftCommentNode) {
            editor.tf.unsetNodes(getDraftCommentKey(), {
              at: [],
              mode: 'lowest',
              match: (n) => n[getDraftCommentKey()],
            });
          }
          setOpen(_open_);
        }}
      >
        <div className="w-full">{children}</div>
        {anchorElement && (
          <PopoverAnchor
            asChild
            className="w-full"
            virtualRef={{ current: anchorElement }}
          />
        )}

        <PopoverContent
          className="max-h-[min(72dvh,calc(-24px+var(--radix-popper-available-height)))] w-[380px] min-w-[130px] max-w-[calc(100vw-24px)] overflow-y-auto p-0 data-[state=closed]:opacity-0"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          align="start"
          collisionPadding={12}
          side="right"
          sideOffset={12}
        >
          {isCommenting ? (
            <CommentCreateForm className="p-4" focusOnMount />
          ) : noneActive ? (
            sortedMergedData.map((item, index) =>
              isResolvedSuggestion(item) ? (
                <BlockSuggestionCard
                  key={item.suggestionId}
                  idx={index}
                  isLast={index === sortedMergedData.length - 1}
                  suggestion={item}
                />
              ) : (
                <BlockComment
                  key={item.id}
                  discussion={item}
                  isLast={index === sortedMergedData.length - 1}
                />
              )
            )
          ) : (
            <>
              {activeSuggestion && (
                <BlockSuggestionCard
                  key={activeSuggestion.suggestionId}
                  idx={0}
                  isLast={true}
                  suggestion={activeSuggestion}
                />
              )}

              {activeDiscussion && (
                <BlockComment discussion={activeDiscussion} isLast={true} />
              )}
            </>
          )}
        </PopoverContent>

        {totalCount > 0 && (
          <div className="relative left-0 size-0 select-none">
            <PopoverTrigger asChild>
              <Button
                aria-label={`${hasUnreadDiscussion ? '查看未读' : '查看该段'}批注，共 ${totalCount} 条`}
                variant="ghost"
                className={cn(
                  '!px-1.5 mt-1 ml-1 flex h-6 gap-1 py-0',
                  hasUnreadDiscussion
                    ? 'bg-brand/10 text-brand shadow-sm hover:bg-brand/15 hover:text-brand'
                    : 'text-muted-foreground/65 hover:bg-muted hover:text-muted-foreground/80',
                  'data-[active=true]:bg-muted data-[active=true]:text-muted-foreground'
                )}
                data-active={open}
                data-unread={hasUnreadDiscussion}
                contentEditable={false}
              >
                {suggestionsCount > 0 && discussionsCount === 0 && (
                  <PencilLineIcon className="size-4 shrink-0" />
                )}

                {suggestionsCount === 0 && discussionsCount > 0 && (
                  <MessageSquareTextIcon className="size-4 shrink-0" />
                )}

                {suggestionsCount > 0 && discussionsCount > 0 && (
                  <MessagesSquareIcon className="size-4 shrink-0" />
                )}

                <span className="font-semibold text-xs">{totalCount}</span>
              </Button>
            </PopoverTrigger>
          </div>
        )}
      </Popover>
    </div>
  );
};

function BlockComment({
  discussion,
  isLast,
}: {
  discussion: TDiscussion;
  isLast: boolean;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const pendingSuggestion = usePluginOption(
    discussionPlugin,
    'pendingAiCommentSuggestion'
  );
  const onAiSuggestionDecision = usePluginOption(
    discussionPlugin,
    'onAiSuggestionDecision'
  );
  const threadSuggestion = pendingSuggestion?.threadId === discussion.id
    ? pendingSuggestion
    : undefined;
  const visibleComments = threadSuggestion?.assistantCommentId
    ? discussion.comments.filter(
        (comment) => comment.id !== threadSuggestion.assistantCommentId
      )
    : discussion.comments;

  return (
    <React.Fragment key={discussion.id}>
      <div className="p-4">
        {visibleComments.map((comment, index) => (
          <Comment
            key={comment.id ?? index}
            comment={comment}
            discussionLength={visibleComments.length}
            documentContent={discussion?.documentContent}
            editingId={editingId}
            index={index}
            locked={discussion.source === 'ai-proactive'}
            setEditingId={setEditingId}
            showDocumentContent
          />
        ))}
        {!threadSuggestion && <CommentCreateForm discussionId={discussion.id} />}
      </div>

      {threadSuggestion && (
        <>
          <div className="h-px w-full bg-muted" />
          <PendingAiCommentSuggestionCard
            onDecision={onAiSuggestionDecision}
            suggestion={threadSuggestion}
          />
        </>
      )}

      {!isLast && <div className="h-px w-full bg-muted" />}
    </React.Fragment>
  );
}
