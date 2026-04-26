CREATE TABLE `videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`youtubeId` varchar(32) NOT NULL,
	`title` text NOT NULL,
	`channel` varchar(255) NOT NULL,
	`channelId` varchar(64),
	`description` text,
	`uploadDate` varchar(16),
	`duration` int,
	`fileSize` bigint,
	`cdnUrl` text NOT NULL,
	`thumbnailUrl` text,
	`status` enum('pending','downloading','done','error') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`archivedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `videos_id` PRIMARY KEY(`id`),
	CONSTRAINT `videos_youtubeId_unique` UNIQUE(`youtubeId`)
);
