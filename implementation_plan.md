# Plano de Implementação: Aba de Impostos & Leitura Automática de Guias e Comprovantes

Este plano detalha a criação da nova aba **"Impostos & Guias Tributárias"** em Contas a Pagar, o leitor automático especializado para todas as guias fiscais anexadas (**PIS/COFINS, ICMS, CSLL, IRPJ, FGTS e INSS**) e a quitação com transição automática para o status **"Pago"** ao anexar o comprovante bancário (ex: Sicredi Pix / Boleto).

---

## 1. Visão Geral da Arquitetura

- **Upload da Guia (PDF/Imagem)** -> **Parser de Impostos (`taxInvoiceParser`)** (Camada 1: PDF.js & Regex; Camada 2: Gemini AI Multimodal) -> Lançamento na Aba "Impostos" (Contas a Pagar).
- **Upload do Comprovante (Sicredi Pix / TED / Boleto)** -> **Parser de Comprovantes (`sicrediReceiptParser`)** -> Extração de Data, Valor Pago, Autenticação, Identificador -> **Transição Automática para Status PAGO** + Preenchimento da Quitação.

---

## 2. Modelos de Impostos Suportados

1. **ICMS**: DARE-SP / GNRE (Código 111-9 / 10003-0)
2. **PIS**: DARF Sicalc Web (Código 6912)
3. **COFINS**: DARF Sicalc Web (Código 5856)
4. **CSLL**: DARF Estimativa Mensal Lucro Real (Código 2484)
5. **IRPJ**: DARF Estimativa Mensal Lucro Real (Código 5993)
6. **INSS**: DARF DCTFWeb / Previdenciário (Códigos 1138, 1082, 1646, 1170, 1218, 1221, etc.)
7. **FGTS**: Guia FGTS Digital / GFD

---

## 3. Automação de Comprovante e Mudança para Status "Pago"

- Ao anexar o comprovante Sicredi (Pix ou Boleto), o sistema extrai o valor, data de pagamento e código de autenticação/identificador.
- O status da conta muda automaticamente de **`Pendente`** para **`Pago`**, salvando os dados e o arquivo do comprovante.
