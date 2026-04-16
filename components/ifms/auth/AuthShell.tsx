import React from 'react';

interface AuthShellProps {
  brandPanel: React.ReactNode;
  formPanel: React.ReactNode;
}

export const AuthShell: React.FC<AuthShellProps> = ({ brandPanel, formPanel }) => {
  return (
    <main className="min-h-screen bg-background text-foreground" aria-label="Authentication">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-8 lg:px-8 lg:py-10">
        <section className="order-2 min-h-[280px] lg:order-1 lg:min-h-[640px]" aria-label="Product information panel">
          {brandPanel}
        </section>
        <section className="order-1 min-h-[420px] lg:order-2 lg:min-h-[640px]" aria-label="Authentication form panel">
          {formPanel}
        </section>
      </div>
    </main>
  );
};
