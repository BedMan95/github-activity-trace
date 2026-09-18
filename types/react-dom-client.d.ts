declare module 'react-dom/client' {
  export interface Root {
    render(children: React.ReactNode): void;
  }
  
  export function createRoot(container: Element | DocumentFragment): Root;
}
