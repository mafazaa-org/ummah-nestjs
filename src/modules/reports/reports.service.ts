import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReportReason } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/exceptions/app.exception';
import { isUniqueViolation } from '../../common/utils/prisma-errors';

export interface ReportResponseDto {
  id: string;
  postId: string;
  reason: ReportReason;
  createdAt: Date;
}

@Injectable()
export class ReportsService {
  private readonly postReportThreshold: number;
  private readonly userReportThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.postReportThreshold = config.get<number>('POST_REPORT_THRESHOLD', 7);
    this.userReportThreshold = config.get<number>('USER_REPORT_THRESHOLD', 15);
  }

  async reportPost(
    reporterId: string,
    postId: string,
    reason: ReportReason,
  ): Promise<ReportResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        // Step 0: Ensure target post is ACTIVE and its author is ACTIVE
        const post = await tx.post.findFirst({
          where: {
            id: postId,
            status: 'ACTIVE',
            author: { status: 'ACTIVE' },
          },
          select: { id: true, authorId: true },
        });

        if (!post) {
          throw new AppException(404, 'POST_NOT_FOUND', 'Post not found');
        }

        // Step 1: Prevent self-reporting
        if (post.authorId === reporterId) {
          throw new AppException(
            403,
            'CANNOT_REPORT_OWN_POST',
            'You cannot report your own post',
          );
        }

        // Step 2: Insert report record (enforcing DB unique constraint [postId, reporterId])
        let report;
        try {
          report = await tx.report.create({
            data: {
              postId,
              reporterId,
              reason,
            },
          });
        } catch (e: unknown) {
          if (isUniqueViolation(e)) {
            throw new AppException(
              409,
              'ALREADY_REPORTED',
              'You have already reported this post',
            );
          }
          throw e;
        }

        // Step 3: Atomic increment of post reportCount (locks post row first)
        const { reportCount: postCount } = await tx.post.update({
          where: { id: postId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true },
        });

        // Step 4: Check post report threshold (hide post if threshold reached)
        if (postCount >= this.postReportThreshold) {
          await tx.post.updateMany({
            where: { id: postId, status: 'ACTIVE' },
            data: { status: 'HIDDEN' },
          });
        }

        // Step 5: Atomic increment of author reportCount (locks author user row second)
        const { reportCount: userCount } = await tx.user.update({
          where: { id: post.authorId },
          data: { reportCount: { increment: 1 } },
          select: { reportCount: true },
        });

        // Step 6: Check user report threshold (suspend user if threshold reached)
        if (userCount >= this.userReportThreshold) {
          await tx.user.updateMany({
            where: { id: post.authorId, status: 'ACTIVE' },
            data: { status: 'SUSPENDED' },
          });
        }

        // Return report response (zero counter leak)
        return {
          id: report.id,
          postId: report.postId,
          reason: report.reason,
          createdAt: report.createdAt,
        };
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
}
