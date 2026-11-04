import { HttpContextToken } from '@angular/common/http';

/** Opt in to structured HTTP failures without changing legacy error consumers. */
export const PRESERVE_HTTP_ERROR = new HttpContextToken<boolean>(() => false);
