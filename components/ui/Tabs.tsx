
import React from 'react';

interface TabsProps {
  value: string;
  onValueChange?: (val: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onValueChange, children, className }) => {
  return (
    <div className={className}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { activeValue: value, onValueChange });
        }
        return child;
      })}
    </div>
  );
};

export const TabsList: React.FC<{ children: React.ReactNode; className?: string; onValueChange?: (v: string) => void }> = ({ children, className, onValueChange }) => {
  return (
    <div className={`flex ${className}`}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { onValueChange });
        }
        return child;
      })}
    </div>
  );
};

export const TabsTrigger: React.FC<{ value: string; activeValue?: string; onValueChange?: (v: string) => void; children: React.ReactNode; className?: string }> = ({ value, activeValue, onValueChange, children, className }) => {
  const isActive = activeValue === value;
  return (
    <button
      onClick={() => onValueChange?.(value)}
      className={`${className} ${isActive ? 'data-[state=active]' : ''}`}
      data-state={isActive ? 'active' : 'inactive'}
    >
      {children}
    </button>
  );
};

export const TabsContent: React.FC<{ value: string; activeValue?: string; children: React.ReactNode; className?: string }> = ({ value, activeValue, children, className }) => {
  if (value !== activeValue) return null;
  return <div className={className}>{children}</div>;
};
