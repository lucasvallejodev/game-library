'use client'

import ReactMarkdown from 'react-markdown'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import styles from './Markdown.module.scss'

/**
 * Sanitisation schema.
 *
 * Starts from rehype-sanitize's conservative default and only *removes* from
 * it — `raw HTML` is already disallowed because we never enable
 * `rehype-raw`. Links are the one element that needs extra care: a
 * `javascript:` href is script execution by another name, and an untrusted
 * target needs rel="noopener".
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ['target'], ['rel']],
  },
  // Only these protocols may appear in an href.
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
}

export interface MarkdownProps {
  children: string
  className?: string
}

/**
 * Renders user-authored markdown.
 *
 * **Sanitised at render, never at storage** — the stored text stays exactly
 * what the user typed, so nothing is silently mangled and the policy can be
 * tightened later without a migration. See docs/security.md §6.
 */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className ? `${styles.markdown} ${className}` : styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          // Anything the user wrote is untrusted: never let it reach into
          // this tab via window.opener.
          a: ({ children: content, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {content}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
