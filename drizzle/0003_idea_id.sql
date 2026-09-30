ALTER TABLE `evaluations` ADD `idea_id` text;--> statement-breakpoint
-- Backfill das linhas gravadas antes da identidade existir. O id deriva de `study_id` + `rank`,
-- unico dentro do estudo (PK composta), entao o resultado e estavel e sem colisao. O prefixo
-- `legacy-` mantem esses ids distintos do UUIDv7 que a aplicacao passa a gerar para ideias novas.
UPDATE `evaluations` SET `idea_id` = 'legacy-' || `study_id` || '-' || printf('%08d', `rank`) WHERE `idea_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `evaluations_study_idea_id_unique` ON `evaluations` (`study_id`,`idea_id`);
