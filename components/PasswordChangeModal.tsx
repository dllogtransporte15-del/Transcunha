
import React, { useState } from 'react';
import type { User } from '../types';

interface PasswordChangeModalProps {
  user: User;
  onPasswordChange: (newPassword: string, currentPassword: string) => Promise<void>;
  onCancel?: () => void;
}

const PasswordChangeModal: React.FC<PasswordChangeModalProps> = ({ user, onPasswordChange, onCancel }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user.isFirstSetup && !currentPassword) {
      setError('A senha atual é obrigatória.');
      return;
    }

    if (newPassword.length < 4) {
      setError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As novas senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onPasswordChange(newPassword, currentPassword);
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro ao atualizar a senha.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-primary/40 backdrop-blur-md transition-all duration-300">
      <div className="w-full max-w-md p-8 bg-white dark:bg-dark-card rounded-2xl shadow-2xl border-t-8 border-accent transform transition-all scale-100 group">
        <div className="text-center mb-8">
           <div className="inline-flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-accent/10 text-accent">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-primary dark:text-white tracking-tight text-center uppercase">
            {user.isFirstSetup ? 'CRIAR SENHA DE ACESSO' : 'SEGURANÇA DE ACESSO'}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Olá, <span className="font-bold text-gray-700 dark:text-white">{user.name}</span>. 
            {user.isFirstSetup 
              ? ' Para garantir a segurança da sua conta, por favor, crie uma senha de acesso.' 
              : ' Por segurança, sua senha deve ser renovada a cada 30 dias. Forneça sua senha atual e crie uma nova.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!user.isFirstSetup && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                  Senha Atual
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  data-no-uppercase="true"
                  className="w-full px-4 py-3 bg-red-50/30 dark:bg-red-900/10 border-2 border-red-100 dark:border-red-900/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-gray-700 dark:text-white transition-all placeholder-gray-400 normal-case"
                  placeholder="Digite sua senha atual"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required={!user.isFirstSetup}
                  disabled={isSubmitting}
                />
              </div>
              <hr className="border-gray-100 dark:border-gray-800" />
            </>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
              Nova Senha
            </label>
            <input
              type="password"
              name="newPassword"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-no-uppercase="true"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-gray-700 dark:text-white transition-all placeholder-gray-400 normal-case"
              placeholder="Digite sua nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
             <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              name="confirmPassword"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-no-uppercase="true"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-gray-700 dark:text-white transition-all placeholder-gray-400 normal-case"
              placeholder="Confirme sua nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-center text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full flex justify-center py-4 px-4 border border-transparent text-base font-black rounded-xl text-white shadow-lg transition-all transform active:scale-[0.98] ${
                isSubmitting 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-accent hover:bg-accent-dark hover:-translate-y-1 shadow-accent/20'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  PROCESSANDO...
                </span>
              ) : 'ATUALIZAR ACESSO'}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="w-full mt-3 py-3 px-4 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                VOLTAR PARA O LOGIN
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] font-bold">
            TRANSCUNHA | SEGURANÇA DIGITAL
          </p>
        </div>
      </div>
    </div>
  );
};

export default PasswordChangeModal;
