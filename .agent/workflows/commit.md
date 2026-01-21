---
description: Commit e push das alterações do projeto DOMINIUM para o GitHub
---

# Workflow: Salvar alterações no GitHub

Este workflow salva todas as alterações locais e envia para o GitHub.

## Passos

1. Verificar status das alterações:
```powershell
git status
```

2. Adicionar todas as alterações:
```powershell
git add .
```

3. Fazer o commit com a mensagem fornecida pelo usuário (pergunte se não foi especificada):
```powershell
git commit -m "MENSAGEM_DO_COMMIT"
```

4. Enviar para o GitHub:
// turbo
```powershell
git push
```

5. Confirmar que o push foi bem sucedido e informar o usuário.

## Notas
- O diretório de trabalho é: `c:\Users\Leandro\OneDrive\Documentos\Aplicativos\DOMINIUM\20260118`
- O repositório remoto é: https://github.com/LeandroHildinger/DOMINIUM
