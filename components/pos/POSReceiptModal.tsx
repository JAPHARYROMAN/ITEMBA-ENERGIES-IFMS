import React from 'react';
import { CheckCircle2, Printer } from 'lucide-react';
import { useCurrency } from '../../lib/hooks/useCurrency';
import { useTranslation } from 'react-i18next';

interface POSReceiptModalProps {
  receipt: {
    id: string;
    timestamp: string;
    quantity: number;
    payment: Record<string, number>;
  };
  totalDue: number;
  onClose: () => void;
}

export const POSReceiptModal: React.FC<POSReceiptModalProps> = ({ receipt, totalDue, onClose }) => {
  const { fmt } = useCurrency();
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white text-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden font-mono border-t-[12px] border-primary flex flex-col gap-6">
        <div className="text-center space-y-1">
          <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={24} />
          </div>
          <h3 className="font-black text-lg">{t('pos.saleCommitted')}</h3>
          <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
            {t('pos.transactionId', { id: receipt.id })}
          </p>
        </div>

        <div className="border-y border-dashed border-slate-300 py-4 space-y-2 text-[11px]">
          <div className="flex justify-between">
            <span>{t('pos.timestampLabel')}</span>{' '}
            <span className="font-black">{new Date(receipt.timestamp).toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('pos.volumeLabel')}</span>{' '}
            <span className="font-black">
              {t('pos.volumeValue', { quantity: receipt.quantity })}
            </span>
          </div>
          <div className="flex justify-between">
            <span>{t('pos.totalDue')}</span> <span className="font-black">{fmt(totalDue)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase opacity-40">{t('pos.paymentMethods')}</p>
          {(Object.entries(receipt.payment) as [string, number][]).map(
            ([type, amt]) =>
              amt > 0 && (
                <div key={type} className="flex justify-between text-xs font-bold capitalize">
                  <span>{type}:</span>
                  <span>{fmt(amt)}</span>
                </div>
              ),
          )}
        </div>

        <div className="pt-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg"
          >
            {t('pos.newTransaction')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="p-4 bg-muted text-muted-foreground rounded-2xl hover:bg-muted/80 transition-all border border-border"
            title="Print Copy"
            aria-label={t('pos.printReceipt')}
          >
            <Printer size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
