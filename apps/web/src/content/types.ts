/** A paragraph, a bulleted list, a link styled as a button, or the contact card. */
export type ContentBlock =
  string | { list: string[] } | { link: { label: string; href: string } } | { contact: true };

export interface ContentSection {
  /** Anchor for the table of contents (`#privacy-rights`). */
  id: string;
  heading: string;
  blocks: ContentBlock[];
}

/** A long-form page (about, help, terms, privacy) in one language. */
export interface ContentPage {
  title: string;
  /** Meta description, and the lead paragraph under the title. */
  description: string;
  /** Show "last updated" and a table of contents (legal documents). */
  legal?: boolean;
  sections: ContentSection[];
}
