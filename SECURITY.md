# Security Policy

## Reportar uma vulnerabilidade

Não abra uma issue pública. Envie um e-mail para **fernandopassoz@gmail.com** com:

- a versão ou o commit afetado;
- o passo a passo para reproduzir;
- o impacto esperado;
- uma sugestão de correção, se tiver.

Você recebe uma resposta em até 7 dias. Corrigi a falha antes de divulgar os detalhes.

## Escopo

O GoodBizz é um serviço de instância única, sem autenticação multiusuário e sem multitenancy.
Implantação exposta à internet deve ficar atrás de um proxy autenticado.

Falhas de interesse:

- execução remota de código, injeção e path traversal;
- vazamento de chaves de API em resposta, log ou artefato;
- bypass de CSRF nas rotas de escrita da interface;
- exposição de dados de um estudo para outro.

## Boas práticas

- Segredos vivem apenas no ambiente ou no SQLite do serviço; nunca no repositório.
- `APP_ENV=production` exige um `SESSION_SECRET` diferente do valor de desenvolvimento.
- Rode `bun audit` e o Gitleaks antes de publicar uma imagem.
