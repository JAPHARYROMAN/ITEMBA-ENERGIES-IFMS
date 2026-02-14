
import React from 'react';
import { Check } from 'lucide-react';

interface ShiftStepperProps {
  currentStep: number;
  steps: string[];
}

export const ShiftStepper: React.FC<ShiftStepperProps> = ({ currentStep, steps }) => {
  return (
    <div className="flex items-center justify-center w-full mb-10">
      {steps.map((step, idx) => (
        <React.Fragment key={idx}>
          <div className="flex flex-col items-center relative">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 border-2 ${
              currentStep > idx 
                ? 'bg-emerald-500 border-emerald-500 text-white' 
                : currentStep === idx 
                  ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' 
                  : 'bg-muted border-border text-muted-foreground'
            }`}>
              {currentStep > idx ? <Check size={14} /> : idx + 1}
            </div>
            <span className={`absolute -bottom-6 whitespace-nowrap text-[9px] font-black uppercase tracking-widest ${
              currentStep === idx ? 'text-primary' : 'text-muted-foreground opacity-50'
            }`}>
              {step}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-16 sm:w-24 h-0.5 mx-2 rounded-full transition-colors duration-500 ${
              currentStep > idx ? 'bg-emerald-500' : 'bg-border'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
