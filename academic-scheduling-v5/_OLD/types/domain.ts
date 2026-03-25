/* eslint-disable @typescript-eslint/no-explicit-any */
// Domain Types (camelCase - frontend convention)
// These types represent the transformed data used throughout the frontend

import type {
  ComponentMetadata,
  PathwayMetadata,
  SeriesGradingConfig,
  SeriesCertificationRules,
  UnitMetadata,
} from '@cogedu/ava-database-types';

import type { ComponentContentData } from './componentContent';
import type {
  Syllabus,
  Taxonomy,
  CertificationRules,
  LearningObjectives,
  Prerequisites,
  AssessmentType,
  ComponentConfiguration,
  GradingInfo,
} from './educational';

// ============================================
// COLLECTION TYPES
// ============================================

export interface Collection {
  id: string;
  tenantId: string | null;
  companyId: string;
  authorUserId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  sku: string | null;
  status: 'draft' | 'published' | 'archived';
  isOfferable: boolean;
  workloadHours: number | null;
  syllabus: Syllabus | null;
  taxonomy: Taxonomy | null;
  certificationRules: CertificationRules | null;
  metadata: Record<string, unknown> | null;
  createdAt: string; // Keep as ISO string
  updatedAt: string;
  deletedAt: string | null;
  authorFullName?: string | null;
  authorSocialName?: string | null;
}

export type CollectionSummary = Collection;

// ============================================
// PATHWAY TYPES
// ============================================

export interface Pathway {
  id: string;
  tenantId: string | null;
  collectionId: string | null;
  companyId: string;
  authorUserId: string;
  title: string;
  objective: string | null;
  progressionRule: 'linear' | 'flexible';
  sku: string | null;
  sequenceOrder: number | null;
  status: 'published' | 'draft' | 'archived';
  taxonomy: Taxonomy | null;
  prerequisites: Prerequisites | null;
  metadata: PathwayMetadata | null;
  createdAt: string;
  updatedAt: string;
  // Multi-parent creation support (used on create, takes precedence over collectionId)
  collectionIds?: string[];
  // Entity reusability: all collection IDs this pathway is linked to (via junction table)
  linkedCollectionIds?: string[];
  authorFullName?: string | null;
  authorSocialName?: string | null;
}

export type PathwaySummary = Pathway;

// ============================================
// SERIES TYPES
// ============================================

export interface Series {
  id: string;
  tenantId: string | null;
  pathwayId: string | null;
  companyId: string;
  authorUserId: string;
  // Professor assignment (who teaches this series)
  professorId: string | null;
  professorFullName?: string | null;
  professorPhotoUrl?: string | null;
  code: string | null;
  title: string;
  bannerUrl: string | null;
  thumbnailUrl: string | null;
  objective: string | null;
  durationHours: number | null;
  difficultyLevel: string | null;
  sku: string | null;
  syllabus: Syllabus | null;
  objectives: LearningObjectives | null;
  prerequisites: Prerequisites | null;
  assessmentTypes: AssessmentType[] | null;
  taxonomy: Taxonomy | null;
  gradingConfig: SeriesGradingConfig | null;
  certificationRules: SeriesCertificationRules | null;
  status: 'published' | 'draft' | 'archived';
  metadata: Record<string, unknown> | null;
  sequenceOrder: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Multi-parent creation support (used on create, takes precedence over pathwayId)
  pathwayIds?: string[];
  // Entity reusability: all pathway IDs this series is linked to (via junction table)
  linkedPathwayIds?: string[];
  authorFullName?: string | null;
  authorSocialName?: string | null;
}

export type SeriesSummary = Series;

// ============================================
// UNIT TYPES
// ============================================

export interface Unit {
  id: string;
  tenantId: string | null;
  seriesId: string;
  companyId: string;
  authorUserId: string;
  // Professor info (resolved via series FK chain)
  professorId?: string | null;
  professorFullName?: string | null;
  professorPhotoUrl?: string | null;
  title: string;
  description: string | null;
  durationHours: number | null;
  objectives: LearningObjectives | null;
  sku: string | null;
  taxonomy: Taxonomy | null;
  status: 'published' | 'draft' | 'archived';
  metadata: UnitMetadata | null;
  sequenceOrder: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  // Multi-parent creation support (used on create, takes precedence over seriesId)
  seriesIds?: string[];
  // Entity reusability: all series IDs this unit is linked to (via junction table)
  linkedSeriesIds?: string[];
  authorFullName?: string | null;
  authorSocialName?: string | null;
}

export type UnitSummary = Unit;

// ============================================
// COMPONENT TYPES
// ============================================

export interface Component {
  // Core identifiers
  id: string;
  tenantId: string | null;
  unitId: string;
  companyId: string;
  authorUserId: string;
  // Professor info (resolved via FK chain: component → unit → series)
  professorId?: string | null;
  professorFullName?: string | null;
  professorPhotoUrl?: string | null;

  // Component classification
  componentType:
  | 'video'
  | 'text'
  | 'quiz'
  | 'formative_assessment'
  | 'summative_assessment'
  | 'assignment'
  | 'discussion'
  | 'link'
  | 'file'
  | 'interactive'
  | 'live_session'
  | 'ai_qa';
  subtype: string | null; // Granular component classification (e.g., 'video_on_demand', 'quiz', 'assignment')

  // Basic info
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  contentUrl: string | null; // URL to content resource (RENAMED from 'configuration')
  contentData: ComponentContentData | null; // Structured content_data based on component type (TYPED)
  estimatedDurationMinutes: number | null; // Estimated duration in minutes (RENAMED from 'durationMinutes')
  isRequired: boolean; // Whether component is required for completion (RENAMED from 'mandatory')
  sku: string | null;
  taxonomy: Taxonomy | null;
  gradingInfo: GradingInfo | null;
  max_score: number | null;

  // External provider integration
  provider: string | null; // Content provider (e.g., 'youtube', 'vimeo', 'zoom', 'smartplayer')
  sourceIdentifier: string | null; // Provider-specific identifier (e.g., video ID, meeting ID)

  // Ordering
  sequenceOrder: number;

  // Metadata (typed for release_condition support)
  metadata: ComponentMetadata | null;

  // Feature flags (from migration 1787000000)
  enableXapiTracking: boolean;
  enableAiFeatures: boolean;
  enableAnnotations: boolean;
  enableAiQa: boolean;
  groupWorkEnabled: boolean;
  discussionEnabled: boolean;
  proctoringEnabled: boolean;
  antiPlagiarismEnabled: boolean;

  // Assessment configuration
  assessmentMode: 'presencial' | 'online' | null;
  questionGenerationMode: 'banco_randomizado' | 'manual' | 'ia_adaptativo' | null;

  // Conference/live session configuration
  conferenceProvider: 'zoom' | 'teams' | 'meet' | null;
  conferenceDate: string | null; // ISO 8601 date string
  conferenceLink: string | null;

  // Presencial activity configuration (Migration 1802000000)
  presencialCompanyId: string | null; // Company/location for presencial activities
  eventId: string | null; // Linked event for attendance tracking
  completionMethod:
  | 'upload_relatorio'
  | 'comprovacao_presenca'
  | 'ava_upload'
  | 'indicacao_aluno'
  | null;

  // Hierarchy context (from listComponents JOIN)
  unitTitle?: string | null;
  seriesTitle?: string | null;

  // Scheduled Date (New primary scheduling field)
  scheduledDate: string | null; // ISO 8601 date string

  // Display options (Migration 202603040004)
  displayNews?: boolean;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;

  // DEPRECATED - Remove in next major version
  /** @deprecated Use contentUrl instead */
  configuration?: ComponentConfiguration | null;
  /** @deprecated Use estimatedDurationMinutes instead */
  durationMinutes?: number | null;
  /** @deprecated Use isRequired instead */
  mandatory?: boolean;
  /** @deprecated No longer used - remove */
  lessonText?: string | null;
  assessmentConfig?: any;
}

export type ComponentSummary = Component;

// ============================================
// CLASS INSTANCE TYPES (Turmas)
// ============================================

export interface ClassInstance {
  id: string;
  tenantId: string | null;
  companyId: string;
  contentType: 'collection' | 'series'; // Determines which table contentId refers to
  contentId: string; // UUID of collection or series based on contentType
  code: string; // Unique class identifier (e.g., "SENAC-JS101-2025-1")
  name: string;
  institution: string;
  institutionName: string | null;
  contentTitle: string | null;
  classType: string | null; // Free text: course, workshop, bootcamp, etc.
  scheduleType: 'morning' | 'afternoon' | 'evening' | 'full_time' | 'flexible' | 'weekend';
  deliveryMode: 'in_person' | 'online' | 'hybrid';
  maxStudents: number;
  startDate: string | null;
  endDate: string | null;
  classStartTime: string | null;
  classEndTime: string | null;
  status: 'active' | 'inactive' | 'completed' | 'cancelled';
  enrolledStudentsCount: number;
  engagementScore: number;
  churnRate: number;
  certificateIssuerCompanyId: string | null;
  // Professor info (from linked series when contentType = 'series')
  professorId?: string | null;
  professorFullName?: string | null;
  professorPhotoUrl?: string | null;
  companyName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type ClassInstanceSummary = ClassInstance;

// ============================================
// CLASS ENROLLMENT TYPES (replaces old Enrollment)
// ============================================

export interface ClassEnrollment {
  id: string;
  tenantId: string | null;
  companyId: string;
  userId: string; // Links to user table (students have user_type='student')
  classInstanceId: string;
  enrollmentDate: string;
  status: 'enrolled' | 'completed' | 'dropped' | 'suspended' | 'transferred';
  completionDate: string | null;
  finalGrade: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Optional joined data
  user?: {
    id: string;
    fullName: string;
    email: string;
    userType: string;
    cpf?: string | null;
  };
  classInstance?: ClassInstance;
}

export type ClassEnrollmentSummary = ClassEnrollment;

// Class enrollment statistics
export interface ClassEnrollmentStats {
  classInstanceId: string;
  totalEnrolled: number;
  totalCompleted: number;
  totalDropped: number;
  totalSuspended: number;
  totalTransferred: number;
  averageGrade: number | null;
  completionRate: number;
}

// ============================================
// ENROLLMENT TYPES (DEPRECATED - use ClassEnrollment)
// ============================================

/**
 * @deprecated Use ClassEnrollment instead. This type will be removed in the next major version.
 */
export interface Enrollment {
  id: string;
  tenantId: string | null;
  studentUserId: string;
  collectionId: string | null;
  seriesId: string | null;
  companyId: string;
  enrolledByUserId: string;
  enrollmentStatus: 'active' | 'completed' | 'dropped' | 'suspended';
  startDate: string | null;
  endDate: string | null;
  completionDate: string | null;
  finalGrade: number | null;
  certificateIssued: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * @deprecated Use ClassEnrollmentSummary instead.
 */
export type EnrollmentSummary = Enrollment;

// ============================================
// STUDENT PROGRESS TYPES
// ============================================

export interface StudentProgress {
  id: string;
  tenantId: string | null;
  classEnrollmentId: string; // Updated: links to class_enrollment instead of old enrollment
  studentUserId: string;
  trackedEntityType: 'collection' | 'pathway' | 'series' | 'unit' | 'component';
  trackedEntityId: string;
  companyId: string;
  completionStatus: 'not_started' | 'in_progress' | 'completed';
  progressPercentage: number;
  timeSpentMinutes: number | null;
  lastAccessedAt: string | null;
  completedAt: string | null;
  score: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  /** @deprecated Use classEnrollmentId instead */
  enrollmentId?: string;
}

export type ProgressSummary = StudentProgress;

// ============================================
// USER-COMPANY TYPES
// ============================================

export interface UserCompany {
  // User-Company relationship fields
  relationshipType: string | null;
  userCompanyCreatedAt: string;

  // Company details
  companyId: string;
  legalName: string;
  displayName: string | null;
  registrationNumber: string | null;
  countryCode: string;
  parentId: string | null;
  representativeUserId: string | null;
  institutionalType: string | null;
  customFields: Record<string, unknown> | null;
  companyCreatedAt: string;
  companyUpdatedAt: string;
}

export type UserCompanySummary = UserCompany;

// ============================================
// RESPONSE WRAPPER TYPES
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface SingleResponse<T> {
  data: T;
}

// ============================================
// ASSESSMENT QUESTION TYPES
// ============================================

export interface Question {
  id: string;
  tenantId: string | null;
  companyId: string;
  questionBankId: string | null;
  componentId: string | null;
  questionText: string;
  questionType:
  | 'multipla_escolha'
  | 'dissertativa'
  | 'oral'
  | 'verdadeiro_falso'
  | 'mista'
  | 'associacao'
  | 'ordenacao';
  correctAnswer: any | null;
  options: any | null;
  points: number;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard' | null;
  justification: string | null;
  actorId: string | null;
  aiGenerated: boolean;
  attachments?:
  | string[]
  | Array<{
    url: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }>;
  irtDifficulty: number | null;
  irtDiscrimination: number | null;
  irtLastCalibratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type QuestionSummary = Question;

// ============================================
// ASSESSMENT TYPES
// ============================================

export type AssessmentCreationMode = 'manual' | 'auto';

export interface AssessmentAutoConfig {
  tags?: string[];
  difficultyRatios?: {
    easy: number;
    medium: number;
    hard: number;
  };
  questionCount?: number;
  manualQuestionIds?: string[];
  rubricCorrection?: boolean;
  rubricId?: string | null;
}

export interface Assessment {
  id: string;
  tenantId: string | null;
  companyId: string;
  name: string;
  description: string | null;
  creationMode: AssessmentCreationMode;
  autoConfig: AssessmentAutoConfig | null;
  questionCount: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rubricId: string | null;
}

export type AssessmentSummary = Assessment;

// ============================================
// ERROR TYPES
// ============================================

export interface ApiError {
  error: string;
  details?: any;
}
