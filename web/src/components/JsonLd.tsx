// Tiny SSR-safe component that serialises a schema.org object into a JSON-LD
// <script> tag. Avoids xss by escaping the closing </script> sequence and
// non-printable control chars; never expose user-controlled HTML through this.
//
// Usage:
//   <JsonLd data={{ '@context': 'https://schema.org', '@type': 'Product', ... }} />

type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdValue[]
  | { [key: string]: JsonLdValue | undefined };

interface JsonLdProps {
  data: JsonLdValue | JsonLdValue[];
  id?: string;
}

function safeSerialise(data: unknown): string {
  return JSON.stringify(data)
    // Prevent breaking out of the <script> tag.
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export default function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safeSerialise(data) }}
    />
  );
}
