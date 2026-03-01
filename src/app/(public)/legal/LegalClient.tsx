"use client";

import { BUNK_DISCLAIMER, TERMS_OF_SERVICE, PRIVACY_POLICY, COOKIE_POLICY, TERMS_VERSION, LEGAL_EFFECTIVE_DATE } from "@/app/config/legal";
import ReactMarkdown from "react-markdown";

export default function LegalClient() {
  return (
    <div className="bg-background text-muted-foreground px-6 md:px-12 pt-6 md:pt-12">
      <div className="max-w-3xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Legal Policies</h1>
            <p className="text-muted-foreground text-sm mt-1">Transparency is our only policy.</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Terms v{TERMS_VERSION}&nbsp;&nbsp;·&nbsp;&nbsp;Effective {LEGAL_EFFECTIVE_DATE}
            </p>
          </div>
        </div>

        {/* Policy Sections */}
        <PolicySection title="Bunk Responsibility Agreement (Disclaimer)" content={BUNK_DISCLAIMER} />
        <PolicySection title="Terms of Service" content={TERMS_OF_SERVICE} />
        <PolicySection title="Privacy Policy" content={PRIVACY_POLICY} />
        <PolicySection title="Cookie Policy" content={COOKIE_POLICY} />
      </div>
    </div>
  );
}

function PolicySection({ title, content }: { title: string, content: string }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-purple-600 dark:text-purple-400 border-l-2 border-purple-500 pl-3">
        {title}
      </h2>
      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground bg-muted/30 p-6 rounded-lg border border-border/50">
        <ReactMarkdown 
           components={{
             h1: ({node: _node, ...props}) => <h3 className="text-sm font-bold text-foreground mt-4 mb-2" {...props} />,
             p: ({node: _node, ...props}) => <p className="leading-relaxed mb-3" {...props} />,
             ul: ({node: _node, ...props}) => <ul className="list-disc pl-5 space-y-1 mb-3" {...props} />,
             li: ({node: _node, ...props}) => <li className="pl-1" {...props} />,
             strong: ({node: _node, ...props}) => <strong className="text-foreground/80" {...props} />
           }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </section>
  );
}