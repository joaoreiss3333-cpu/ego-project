import Link from 'next/link';
import { SITE_PATHS } from '@ego/content';
import { Empty } from '@/components/ui';

export default function NotFound() {
  return (
    <Empty
      code="404 / fora do registro"
      title="Essa sala não existe"
      action={
        <div className="row">
          <Link href={SITE_PATHS.perfil} className="btn btn--primary">
            Voltar ao perfil
          </Link>
          <Link href={SITE_PATHS.guias} className="btn btn--ghost">
            Guias
          </Link>
        </div>
      }
    >
      <p>O endereço não leva a nenhuma página da instalação. Confira o link.</p>
    </Empty>
  );
}
