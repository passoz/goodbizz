/**
 * Tipagem do renderer JSX: `c.render(<Pagina />, { title })` entrega o titulo ao layout.
 * O modulo precisa ser um modulo para que a augmentacao de "hono" valha no programa inteiro.
 */
declare module "hono" {
  interface ContextRenderer {
    (content: string | Promise<string>, props: { title: string }): Response;
  }
}

export {};
