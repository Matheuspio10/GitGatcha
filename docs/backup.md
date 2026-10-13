# Backup diário do banco

O workflow [`.github/workflows/backup.yml`](../.github/workflows/backup.yml) roda todo dia às 06:30 UTC e também pode ser disparado à mão pela aba **Actions → Database backup → Run workflow**.

1. Ele faz um `pg_dump` do banco de **produção**.
2. Comprime o dump com gzip.
3. Criptografa com [age](https://github.com/FiloSottile/age) **antes de gravar no disco**.
4. Guarda o arquivo `gitgacha-<data>.sql.gz.age` como artifact do Actions por 30 dias.

O repositório é público e qualquer pessoa logada no GitHub pode baixar os artifacts. Por isso o dump, que tem e-mails e hashes de senha, só é guardado criptografado. Só quem tem a chave privada consegue abrir.

## Configuração (uma vez)

1. **Instalar o age** (Windows):
   ```
   winget install FiloSottile.age
   ```
2. **Gerar o par de chaves:**
   ```
   age-keygen -o gitgacha-backup.key
   ```
   O comando mostra a chave pública (`age1…`). O arquivo `gitgacha-backup.key` é a **chave privada**:
   - guarde em um lugar seguro, como um gerenciador de senhas, fora do repositório;
   - sem ela, os backups não abrem.
3. **Variável no GitHub:** em Settings → Secrets and variables → Actions → **Variables**, crie `BACKUP_AGE_RECIPIENT` com a chave pública `age1…`. Ela não é segredo.
4. **Secret no GitHub:** na aba **Secrets**, crie `BACKUP_DATABASE_URL` com a URL de produção do Neon.
   - O workflow troca o host `-pooler.` pelo direto sozinho.
   - O ideal é um usuário só de leitura. No SQL Editor do Neon, na branch `production`:
     ```sql
     CREATE ROLE backup_reader WITH LOGIN PASSWORD '<senha forte>';
     GRANT pg_read_all_data TO backup_reader;
     ```
   - Se o Neon não aceitar o `GRANT`, use o usuário normal da produção.
5. Rode o workflow à mão uma vez e confira se o artifact apareceu.

## Restaurar

Restaure sempre numa **branch nova do Neon**, nunca direto em cima da produção. Depois confira os dados e só então decida o que fazer.

1. Baixe o artifact em Actions → execução do dia → Artifacts e descompacte o `.zip` do GitHub.
2. Descriptografe:
   ```
   age --decrypt -i gitgacha-backup.key gitgacha-<data>.sql.gz.age > dump.sql.gz
   ```
3. Carregue numa branch vazia (precisa do `psql`, versão 18 ou mais nova):
   ```
   gzip -dc dump.sql.gz | psql "<URL da branch nova>"
   ```
4. Apague o `dump.sql.gz` depois de usar: ele está em texto puro.
