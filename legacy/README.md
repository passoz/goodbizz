# Baseline Python (legado)

Esta pasta guarda a implementação original do GoodBizz, mantida como referência. O runtime
suportado, testado e publicado é o TypeScript em `src/`.

O código não recebe correções nem novas funcionalidades. Ele existe para comparar o comportamento
do port e para consultar as decisões originais.

```bash
python3 legacy/python/generate_study.py --help
python3 legacy/python/diagnose.py --help
python3 legacy/python/recalibrate.py --help
```

Os scripts inserem o próprio diretório no `sys.path`, então rodam de qualquer lugar. As dependências
do baseline não estão fixadas; use um virtualenv se quiser executá-lo.
