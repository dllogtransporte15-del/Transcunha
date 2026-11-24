import React from 'react';
import { ControlFiscalTab } from './ControlFiscalTab';
import type { Branch, User, Client } from '../../types';

interface ControlFiscalModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches?: Branch[];
  clients?: Client[];
  currentUser?: User | null;
}

export const ControlFiscalModal: React.FC<ControlFiscalModalProps> = ({
  isOpen,
  onClose,
  branches = [],
  clients = [],
  currentUser
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 w-full max-w-7xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ControlFiscalTab 
            branches={branches} 
            clients={clients}
            currentUser={currentUser} 
            isModal={true} 
            onClose={onClose} 
          />
        </div>
      </div>
    </div>
  );
};

export default ControlFiscalModal;
