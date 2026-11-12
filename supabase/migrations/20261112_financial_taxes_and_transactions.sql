-- ====================================================================
-- MÓDULO FINANCEIRO: LANÇAMENTO E GESTÃO DE IMPOSTOS E TRIBUTOS
-- Suporte a guias DARE-SP (ICMS), DARF Sicalc (PIS/COFINS), CSLL, IRPJ,
-- FGTS Digital, DCTFWeb/INSS e sincronização em tempo real entre operadores.
-- ====================================================================

-- Inicializa o registro dedicado de transações compartilhadas na tabela profile_permissions (row 890)
INSERT INTO public.profile_permissions (id, permissions)
VALUES (
    890,
    jsonb_build_object(
        'transactions', '[]'::jsonb,
        'updatedAt', timezone('utc'::text, now())::text
    )
)
ON CONFLICT (id) DO NOTHING;
