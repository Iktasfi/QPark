'use client';

import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

export function AdminButton() {
  return (
    <Button
      onClick={() => window.open('/admin-dashboard', '_blank')}
      variant="outline"
      className="fixed bottom-4 right-4 z-50 gap-2"
    >
      <Settings className="h-4 w-4" />
      Admin Panel
    </Button>
  );
}
