import React from 'react';

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({ title, subtitle, children, footer }) => {
  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:min-h-[560px] sm:p-8" aria-labelledby="auth-title">
        <header className="mb-6 space-y-1">
          <h2 id="auth-title" className="text-2xl font-black tracking-tight text-foreground">
            {title}
          </h2>
          <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
        </header>
        {children}
        {footer ? <footer className="mt-6 border-t border-border pt-4">{footer}</footer> : null}
      </section>
    </div>
  );
};
