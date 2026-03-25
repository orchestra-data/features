/* eslint-disable @typescript-eslint/no-explicit-any */
// API Transformers - Convert between API (snake_case) and Domain (camelCase) types

import type {
  ApiCollectionResponse,
  ApiListCollectionsResponse,
  ApiPathwayResponse,
  ApiListPathwaysResponse,
  ApiSeriesResponse,
  ApiListSeriesResponse,
  ApiUnitResponse,
  ApiListUnitsResponse,
  ApiComponentResponse,
  ApiListComponentsResponse,
  ApiClassInstanceResponse,
  ApiListClassInstancesResponse,
  ApiClassEnrollmentResponse,
  ApiListClassEnrollmentsResponse,
  ApiClassEnrollmentStatsResponse,
  ApiEnrollmentResponse,
  ApiListEnrollmentsResponse,
  ApiStudentProgressResponse,
  ApiListProgressResponse,
  ApiUserCompanyResponse,
  ApiListUserCompaniesResponse,
  ApiQuestionResponse,
  ApiListQuestionsResponse,
  ApiAssessmentResponse,
  ApiListAssessmentsResponse,
} from '../types/api';
import type {
  Collection,
  Pathway,
  Series,
  Unit,
  Component,
  ClassInstance,
  ClassEnrollment,
  ClassEnrollmentStats,
  Enrollment,
  StudentProgress,
  UserCompany,
  Question,
  Assessment,
  PaginatedResponse,
} from '../types/domain';

// ============================================
// COLLECTION TRANSFORMERS
// ============================================

export function transformCollection(api: ApiCollectionResponse): Collection {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    companyId: api.company_id,
    authorUserId: api.author_user_id,
    title: api.title,
    description: api.description,
    thumbnailUrl: api.thumbnail_url,
    bannerUrl: api.banner_url,
    sku: api.sku,
    status: api.status,
    isOfferable: api.is_offerable,
    workloadHours: (api as any).workload_hours ?? null,
    syllabus: api.syllabus,
    taxonomy: api.taxonomy,
    certificationRules: api.certification_rules,
    metadata: api.metadata,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    authorFullName: api.author_full_name,
    authorSocialName: api.author_social_name,
  };
}

export function transformCollections(
  api: ApiListCollectionsResponse
): PaginatedResponse<Collection> {
  return {
    data: api.data.map(transformCollection),
    pagination: api.pagination,
  };
}

export function toApiCollection(collection: Partial<Collection>): any {
  return {
    title: collection.title,
    description: collection.description,
    thumbnail_url: collection.thumbnailUrl,
    banner_url: collection.bannerUrl,
    sku: collection.sku,
    status: collection.status,
    is_offerable: collection.isOfferable,
    workload_hours: collection.workloadHours,
    syllabus: collection.syllabus,
    taxonomy: collection.taxonomy,
    certification_rules: collection.certificationRules,
    metadata: collection.metadata,
    // Include company_id in body for explicit company selection
    company_id: collection.companyId,
  };
}

// ============================================
// PATHWAY TRANSFORMERS
// ============================================

export function transformPathway(api: ApiPathwayResponse): Pathway {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    collectionId: api.collection_id,
    companyId: api.company_id,
    authorUserId: api.author_user_id,
    title: api.title,
    objective: api.objective,
    progressionRule: api.progression_rule,
    sku: api.sku,
    sequenceOrder: api.sequence_order,
    status: api.status,
    taxonomy: api.taxonomy,
    prerequisites: api.prerequisites,
    metadata: api.metadata,
    // Entity reusability: all collection IDs this pathway is linked to (via junction table)
    linkedCollectionIds: (api as any).linked_collection_ids ?? undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    authorFullName: api.author_full_name,
    authorSocialName: api.author_social_name,
  };
}

export function transformPathways(api: ApiListPathwaysResponse): PaginatedResponse<Pathway> {
  return {
    data: api.data.map(transformPathway),
    pagination: api.pagination,
  };
}

export function toApiPathway(pathway: Partial<Pathway>): any {
  const result: any = {};
  // Multi-parent support: collection_ids takes precedence over collection_id
  if (pathway.collectionIds !== undefined && pathway.collectionIds.length > 0) {
    result.collection_ids = pathway.collectionIds;
  } else if (pathway.collectionId !== undefined) {
    result.collection_id = pathway.collectionId;
  }
  if (pathway.title !== undefined) result.title = pathway.title;
  if (pathway.objective !== undefined) result.objective = pathway.objective;
  if (pathway.progressionRule !== undefined) result.progression_rule = pathway.progressionRule;
  if (pathway.sku !== undefined) result.sku = pathway.sku;
  if (pathway.sequenceOrder !== undefined) result.sequence_order = pathway.sequenceOrder;
  if (pathway.status !== undefined) result.status = pathway.status;
  if (pathway.taxonomy !== undefined) result.taxonomy = pathway.taxonomy;
  if (pathway.prerequisites !== undefined) result.prerequisites = pathway.prerequisites;
  if (pathway.metadata !== undefined) result.metadata = pathway.metadata;
  return result;
}

// ============================================
// SERIES TRANSFORMERS
// ============================================

export function transformSeries(api: ApiSeriesResponse): Series {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    pathwayId: api.pathway_id,
    companyId: api.company_id,
    authorUserId: api.author_user_id,
    // Professor assignment
    professorId: (api as any).professor_id ?? null,
    professorFullName: (api as any).professor_full_name ?? null,
    professorPhotoUrl: (api as any).professor_photo_url ?? null,
    code: api.code,
    title: api.title,
    bannerUrl: api.banner_url,
    thumbnailUrl: api.thumbnail_url,
    // Map description to objective for compatibility
    objective: (api as any).description || api.objective,
    // Map workload_hours to durationHours for compatibility
    durationHours: (api as any).workload_hours || api.duration_hours,
    difficultyLevel: api.difficulty_level,
    sku: api.sku,
    syllabus: api.syllabus,
    objectives: api.objectives,
    prerequisites: api.prerequisites,
    assessmentTypes: api.assessment_types,
    taxonomy: api.taxonomy,
    gradingConfig: api.grading_config,
    certificationRules: api.certification_rules,
    status: api.status,
    metadata: api.metadata,
    sequenceOrder: api.sequence_order,
    // Entity reusability: all pathway IDs this series is linked to (via junction table)
    linkedPathwayIds: (api as any).linked_pathway_ids ?? undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    authorFullName: api.author_full_name,
    authorSocialName: api.author_social_name,
  };
}

export function transformSeriesList(api: ApiListSeriesResponse): PaginatedResponse<Series> {
  return {
    data: api.data.map(transformSeries),
    pagination: api.pagination,
  };
}

export function toApiSeries(series: Partial<Series>): any {
  const result: any = {};
  // Multi-parent support: pathway_ids takes precedence over pathway_id
  if (series.pathwayIds !== undefined && series.pathwayIds.length > 0) {
    result.pathway_ids = series.pathwayIds;
  } else if (series.pathwayId !== undefined) {
    result.pathway_id = series.pathwayId;
  }
  if (series.code !== undefined) result.code = series.code;
  if (series.title !== undefined) result.title = series.title;
  if (series.bannerUrl !== undefined) result.banner_url = series.bannerUrl;
  if (series.thumbnailUrl !== undefined) result.thumbnail_url = series.thumbnailUrl;
  // Map objective to description for DB compatibility
  if (series.objective !== undefined) {
    result.objective = series.objective;
    result.description = series.objective; // Also send as description for DB
  }
  // Map durationHours to workload_hours for DB compatibility
  if (series.durationHours !== undefined && series.durationHours !== null) {
    // Convert to number to ensure it's not a string
    let workloadHours: number;
    if (typeof series.durationHours === 'string') {
      workloadHours = parseFloat(series.durationHours);
      if (isNaN(workloadHours)) {
        // If parsing fails, skip this field
        return result;
      }
    } else if (typeof series.durationHours === 'number') {
      workloadHours = series.durationHours;
    } else {
      // Try to convert to number
      workloadHours = Number(series.durationHours);
      if (isNaN(workloadHours)) {
        return result;
      }
    }
    result.duration_hours = workloadHours;
    result.workload_hours = workloadHours; // Also send as workload_hours for DB
  } else if (series.durationHours === null) {
    result.duration_hours = null;
    result.workload_hours = null;
  }
  if (series.difficultyLevel !== undefined) result.difficulty_level = series.difficultyLevel;
  if (series.sku !== undefined) result.sku = series.sku;
  if (series.syllabus !== undefined) result.syllabus = series.syllabus;
  if (series.objectives !== undefined) result.objectives = series.objectives;
  if (series.prerequisites !== undefined) result.prerequisites = series.prerequisites;
  if (series.assessmentTypes !== undefined) result.assessment_types = series.assessmentTypes;
  if (series.taxonomy !== undefined) result.taxonomy = series.taxonomy;
  if (series.gradingConfig !== undefined) result.grading_config = series.gradingConfig;
  if (series.certificationRules !== undefined)
    result.certification_rules = series.certificationRules;
  if (series.status !== undefined) result.status = series.status;
  if (series.metadata !== undefined) result.metadata = series.metadata;
  if (series.sequenceOrder !== undefined) result.sequence_order = series.sequenceOrder;
  // Include company_id in body for explicit company selection (standalone series)
  if (series.companyId !== undefined) result.company_id = series.companyId;
  // Professor assignment
  if (series.professorId !== undefined) result.professor_id = series.professorId;
  return result;
}

// ============================================
// UNIT TRANSFORMERS
// ============================================

export function transformUnit(api: ApiUnitResponse): Unit {
  // Map estimated_duration_minutes (from DB) to durationHours (convert minutes to hours)
  const durationMinutes = (api as any).estimated_duration_minutes || api.duration_hours;
  const durationHours = durationMinutes ? durationMinutes / 60 : null;

  return {
    id: api.id,
    tenantId: api.tenant_id,
    seriesId: api.series_id,
    companyId: api.company_id,
    authorUserId: api.author_user_id,
    // Professor info (resolved via series FK chain)
    professorId: (api as any).professor_id ?? null,
    professorFullName: (api as any).professor_full_name ?? null,
    professorPhotoUrl: (api as any).professor_photo_url ?? null,
    title: api.title,
    description: api.description,
    durationHours: durationHours,
    objectives: api.objectives,
    sku: api.sku,
    taxonomy: api.taxonomy,
    status: api.status,
    metadata: api.metadata,
    sequenceOrder: api.sequence_order,
    // Entity reusability: all series IDs this unit is linked to (via junction table)
    linkedSeriesIds: (api as any).linked_series_ids ?? undefined,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    authorFullName: api.author_full_name,
    authorSocialName: api.author_social_name,
  };
}

export function transformUnits(api: ApiListUnitsResponse): PaginatedResponse<Unit> {
  return {
    data: api.data.map(transformUnit),
    pagination: api.pagination,
  };
}

export function toApiUnit(unit: Partial<Unit>): any {
  const result: any = {};
  // Multi-parent support: series_ids takes precedence over series_id
  if (unit.seriesIds !== undefined && unit.seriesIds.length > 0) {
    result.series_ids = unit.seriesIds;
  } else if (unit.seriesId !== undefined) {
    result.series_id = unit.seriesId;
  }
  if (unit.title !== undefined) result.title = unit.title;
  if (unit.description !== undefined) result.description = unit.description;
  // Convert durationHours (hours) to estimated_duration_minutes (minutes) for DB
  if (unit.durationHours !== undefined) {
    result.duration_hours = unit.durationHours;
    result.estimated_duration_minutes = unit.durationHours
      ? Math.round(unit.durationHours * 60)
      : null;
  }
  if (unit.objectives !== undefined) result.objectives = unit.objectives;
  if (unit.sku !== undefined) result.sku = unit.sku;
  if (unit.taxonomy !== undefined) result.taxonomy = unit.taxonomy;
  if (unit.status !== undefined) result.status = unit.status;
  if (unit.metadata !== undefined) result.metadata = unit.metadata;
  if (unit.sequenceOrder !== undefined) result.sequence_order = unit.sequenceOrder;
  return result;
}

// ============================================
// COMPONENT TRANSFORMERS
// ============================================

export function transformComponent(api: ApiComponentResponse): Component {
  // Keep the actual component_type from database (video, quiz, assignment, etc.)
  // Don't convert to category - we need the specific type for ConfigPanel conditional rendering
  return {
    // Core identifiers
    id: api.id,
    tenantId: api.tenant_id,
    unitId: api.unit_id,
    companyId: api.company_id,
    authorUserId: api.author_user_id,
    // Professor info (resolved via FK chain: component → unit → series)
    professorId: (api as any).professor_id ?? null,
    professorFullName: (api as any).professor_full_name ?? null,
    professorPhotoUrl: (api as any).professor_photo_url ?? null,

    // Component classification
    componentType: api.component_type as
      | 'video'
      | 'text'
      | 'quiz'
      | 'assignment'
      | 'discussion'
      | 'link'
      | 'file'
      | 'interactive'
      | 'live_session'
      | 'ai_qa',
    subtype: api.subtype || null,

    // Basic info
    title: api.title,
    description: api.description,
    thumbnailUrl: (api as any).thumbnail_url || null,
    contentUrl: api.content_url || null,
    contentData: api.content_data || null,
    estimatedDurationMinutes: api.estimated_duration_minutes || null,
    isRequired: api.is_required ?? false,
    sku: api.sku,
    taxonomy: api.taxonomy,
    gradingInfo: api.grading_info,

    // External provider integration
    provider: api.provider || null,
    sourceIdentifier: api.source_identifier || null,

    // Ordering
    sequenceOrder: api.sequence_order,

    // Metadata (typed)
    metadata: api.metadata || null,

    // Feature flags (default to false if not provided)
    enableXapiTracking: api.enable_xapi_tracking ?? false,
    enableAiFeatures: api.enable_ai_features ?? false,
    enableAnnotations: api.enable_annotations ?? false,
    enableAiQa: api.enable_ai_qa ?? false,
    groupWorkEnabled: api.group_work_enabled ?? false,
    discussionEnabled: api.discussion_enabled ?? false,
    proctoringEnabled: api.proctoring_enabled ?? false,
    antiPlagiarismEnabled: api.anti_plagiarism_enabled ?? false,
    displayNews: (api as any).display_news ?? false,

    // Assessment configuration
    assessmentMode: api.assessment_mode || null,
    questionGenerationMode: api.question_generation_mode || null,

    // Conference/live session configuration
    conferenceProvider: api.conference_provider || null,
    conferenceDate: api.conference_date || null,
    conferenceLink: api.conference_link || null,

    // Presencial activity configuration
    presencialCompanyId: (api as any).presencial_company_id || null,
    eventId: (api as any).event_id || null,
    completionMethod: (api as any).completion_method || null,

    // Hierarchy context (from listComponents JOIN)
    unitTitle: (api as any).unit_title ?? null,
    seriesTitle: (api as any).series_title ?? null,

    // Scheduled Date
    scheduledDate: api.scheduled_date || null,

    // Timestamps
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,

    // Extracted max_score logic
    max_score:
      (api.content_data as any)?.presencial_activity?.technical_visit?.max_score ||
      (api.content_data as any)?.presencial_activity?.lecture?.max_score ||
      (api.grading_info as any)?.max_score ||
      null,

    // DEPRECATED fields for backward compatibility
    configuration: api.configuration || api.content_url || null,
    durationMinutes: api.estimated_duration_minutes || null,
    mandatory: api.is_required ?? false,
    lessonText: api.description,
  };
}

export function transformComponents(api: ApiListComponentsResponse): PaginatedResponse<Component> {
  return {
    data: api.data.map(transformComponent),
    pagination: api.pagination,
  };
}

export function toApiComponent(component: Partial<Component>): any {
  const result: any = {};

  // Core identifiers
  if (component.unitId !== undefined) result.unit_id = component.unitId;
  if (component.companyId !== undefined) result.company_id = component.companyId;

  // Component classification
  // componentType: Include on CREATE (when unitId is present, meaning new component)
  // Exclude on UPDATE (to avoid overwriting with category instead of DB type)
  // On CREATE, ComponentBuilder sends the actual DB type (quiz/video/etc), not the category
  if (component.componentType !== undefined && component.unitId !== undefined) {
    result.component_type = component.componentType;
  }
  if (component.subtype !== undefined) result.subtype = component.subtype;

  // Basic info
  if (component.title !== undefined) result.title = component.title;
  if (component.description !== undefined) result.description = component.description;
  if (component.thumbnailUrl !== undefined) result.thumbnail_url = component.thumbnailUrl;

  // Handle both new field (contentUrl) and deprecated field (configuration) for backward compatibility
  if (component.contentUrl !== undefined) {
    result.content_url = component.contentUrl;
  } else if (component.configuration !== undefined) {
    result.content_url = component.configuration;
  }

  if (component.contentData !== undefined) result.content_data = component.contentData;

  // Handle both new field (estimatedDurationMinutes) and deprecated field (durationMinutes)
  if (component.estimatedDurationMinutes !== undefined) {
    result.estimated_duration_minutes = component.estimatedDurationMinutes;
  } else if (component.durationMinutes !== undefined) {
    result.estimated_duration_minutes = component.durationMinutes;
  }

  // Handle both new field (isRequired) and deprecated field (mandatory)
  if (component.isRequired !== undefined) {
    result.is_required = component.isRequired;
  } else if (component.mandatory !== undefined) {
    result.is_required = component.mandatory;
  }

  if (component.sku !== undefined) result.sku = component.sku;
  if (component.taxonomy !== undefined) result.taxonomy = component.taxonomy;
  if (component.gradingInfo !== undefined) result.grading_info = component.gradingInfo;

  // External provider integration
  if (component.provider !== undefined) result.provider = component.provider;
  if (component.sourceIdentifier !== undefined)
    result.source_identifier = component.sourceIdentifier;

  // Ordering
  if (component.sequenceOrder !== undefined) result.sequence_order = component.sequenceOrder;

  // Metadata
  if (component.metadata !== undefined) result.metadata = component.metadata;

  // Feature flags
  if (component.enableXapiTracking !== undefined)
    result.enable_xapi_tracking = component.enableXapiTracking;
  if (component.enableAiFeatures !== undefined)
    result.enable_ai_features = component.enableAiFeatures;
  if (component.enableAnnotations !== undefined)
    result.enable_annotations = component.enableAnnotations;
  if (component.enableAiQa !== undefined) result.enable_ai_qa = component.enableAiQa;
  if (component.groupWorkEnabled !== undefined)
    result.group_work_enabled = component.groupWorkEnabled;
  if (component.discussionEnabled !== undefined)
    result.discussion_enabled = component.discussionEnabled;
  if (component.proctoringEnabled !== undefined)
    result.proctoring_enabled = component.proctoringEnabled;
  if (component.antiPlagiarismEnabled !== undefined)
    result.anti_plagiarism_enabled = component.antiPlagiarismEnabled;
  if (component.displayNews !== undefined) result.display_news = component.displayNews;

  // Assessment configuration
  if (component.assessmentMode !== undefined) result.assessment_mode = component.assessmentMode;
  if (component.questionGenerationMode !== undefined)
    result.question_generation_mode = component.questionGenerationMode;

  if (component.assessmentConfig !== undefined)
    result.assessment_config = component.assessmentConfig;

  // Conference/live session configuration
  if (component.conferenceProvider !== undefined)
    result.conference_provider = component.conferenceProvider;
  if (component.conferenceDate !== undefined) result.conference_date = component.conferenceDate;
  if (component.conferenceLink !== undefined) result.conference_link = component.conferenceLink;

  // Presencial activity configuration
  if (component.presencialCompanyId !== undefined)
    result.presencial_company_id = component.presencialCompanyId;
  if (component.eventId !== undefined) result.event_id = component.eventId;
  if (component.completionMethod !== undefined)
    result.completion_method = component.completionMethod;

  if (component.scheduledDate !== undefined) result.scheduled_date = component.scheduledDate;

  return result;
}

// ============================================
// CLASS INSTANCE TRANSFORMERS (Turmas)
// ============================================

export function transformClassInstance(api: ApiClassInstanceResponse): ClassInstance {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    companyId: api.company_id,
    contentType: api.content_type,
    contentId: api.content_id,
    code: api.code,
    name: api.name,
    institution: api.institution,
    institutionName: (api as any).institution_name ?? null,
    contentTitle: (api as any).content_title ?? null,
    classType: api.class_type,
    scheduleType: api.schedule_type,
    deliveryMode: api.delivery_mode,
    maxStudents: api.max_students,
    startDate: api.start_date,
    endDate: api.end_date,
    classStartTime: api.class_start_time,
    classEndTime: api.class_end_time,
    status: api.status,
    enrolledStudentsCount: api.enrolled_students_count,
    engagementScore: api.engagement_score,
    churnRate: api.churn_rate,
    certificateIssuerCompanyId: api.certificate_issuer_company_id,
    // Professor info (from linked series when content_type = 'series')
    professorId: (api as any).series_professor_id ?? (api as any).professor_id ?? null,
    professorFullName: (api as any).professor_full_name ?? null,
    professorPhotoUrl: (api as any).professor_photo_url ?? null,
    companyName: api.company_name ?? null,
    metadata: api.metadata,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
  };
}

export function transformClassInstances(
  api: ApiListClassInstancesResponse
): PaginatedResponse<ClassInstance> {
  return {
    data: api.data.map(transformClassInstance),
    pagination: api.pagination,
  };
}

export function toApiClassInstance(classInstance: Partial<ClassInstance>): any {
  const result: any = {};
  if (classInstance.contentType !== undefined) result.content_type = classInstance.contentType;
  if (classInstance.contentId !== undefined) result.content_id = classInstance.contentId;
  if (classInstance.code !== undefined) result.code = classInstance.code;
  if (classInstance.name !== undefined) result.name = classInstance.name;
  if (classInstance.institution !== undefined) result.institution = classInstance.institution;
  if (classInstance.classType !== undefined) result.class_type = classInstance.classType;
  if (classInstance.scheduleType !== undefined) result.schedule_type = classInstance.scheduleType;
  if (classInstance.deliveryMode !== undefined) result.delivery_mode = classInstance.deliveryMode;
  if (classInstance.maxStudents !== undefined) result.max_students = classInstance.maxStudents;
  if (classInstance.startDate !== undefined) result.start_date = classInstance.startDate;
  if (classInstance.endDate !== undefined) result.end_date = classInstance.endDate;
  if (classInstance.classStartTime !== undefined) result.class_start_time = classInstance.classStartTime;
  if (classInstance.classEndTime !== undefined) result.class_end_time = classInstance.classEndTime;
  if (classInstance.status !== undefined) result.status = classInstance.status;
  if (classInstance.certificateIssuerCompanyId !== undefined)
    result.certificate_issuer_company_id = classInstance.certificateIssuerCompanyId;
  if (classInstance.metadata !== undefined) result.metadata = classInstance.metadata;
  return result;
}

// ============================================
// CLASS ENROLLMENT TRANSFORMERS (replaces old Enrollment)
// ============================================

export function transformClassEnrollment(api: ApiClassEnrollmentResponse): ClassEnrollment {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    companyId: api.company_id,
    userId: api.user_id,
    classInstanceId: api.class_instance_id,
    enrollmentDate: api.enrollment_date,
    status: api.status,
    completionDate: api.completion_date,
    finalGrade: api.final_grade,
    metadata: api.metadata,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    // Transform optional joined data
    user: api.user
      ? {
        id: api.user.id,
        fullName: api.user.full_name,
        email: api.user.email,
        userType: api.user.user_type,
        cpf: api.user.cpf || null,
      }
      : undefined,
    classInstance: api.class_instance ? transformClassInstance(api.class_instance) : undefined,
  };
}

export function transformClassEnrollments(
  api: ApiListClassEnrollmentsResponse
): PaginatedResponse<ClassEnrollment> {
  return {
    data: api.data.map(transformClassEnrollment),
    pagination: api.pagination,
  };
}

export function transformClassEnrollmentStats(
  api: ApiClassEnrollmentStatsResponse
): ClassEnrollmentStats {
  return {
    classInstanceId: api.class_instance_id,
    totalEnrolled: api.total_enrolled,
    totalCompleted: api.total_completed,
    totalDropped: api.total_dropped,
    totalSuspended: api.total_suspended,
    totalTransferred: api.total_transferred,
    averageGrade: api.average_grade,
    completionRate: api.completion_rate,
  };
}

export function toApiClassEnrollment(enrollment: Partial<ClassEnrollment>): any {
  const result: any = {};
  if (enrollment.userId !== undefined) result.user_id = enrollment.userId;
  if (enrollment.classInstanceId !== undefined)
    result.class_instance_id = enrollment.classInstanceId;
  if (enrollment.enrollmentDate !== undefined) result.enrollment_date = enrollment.enrollmentDate;
  if (enrollment.status !== undefined) result.status = enrollment.status;
  if (enrollment.completionDate !== undefined) result.completion_date = enrollment.completionDate;
  if (enrollment.finalGrade !== undefined) result.final_grade = enrollment.finalGrade;
  if (enrollment.metadata !== undefined) result.metadata = enrollment.metadata;
  return result;
}

// ============================================
// ENROLLMENT TRANSFORMERS (DEPRECATED - use ClassEnrollment)
// ============================================

/**
 * @deprecated Use transformClassEnrollment instead.
 */
export function transformEnrollment(api: ApiEnrollmentResponse): Enrollment {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    studentUserId: api.student_user_id,
    collectionId: api.collection_id,
    seriesId: api.series_id,
    companyId: api.company_id,
    enrolledByUserId: api.enrolled_by_user_id,
    enrollmentStatus: api.enrollment_status,
    startDate: api.start_date,
    endDate: api.end_date,
    completionDate: api.completion_date,
    finalGrade: api.final_grade,
    certificateIssued: api.certificate_issued,
    metadata: api.metadata,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

export function transformEnrollments(
  api: ApiListEnrollmentsResponse
): PaginatedResponse<Enrollment> {
  return {
    data: api.data.map(transformEnrollment),
    pagination: api.pagination,
  };
}

export function toApiEnrollment(enrollment: Partial<Enrollment>): any {
  return {
    student_user_id: enrollment.studentUserId,
    collection_id: enrollment.collectionId,
    series_id: enrollment.seriesId,
    enrollment_status: enrollment.enrollmentStatus,
    start_date: enrollment.startDate,
    end_date: enrollment.endDate,
    completion_date: enrollment.completionDate,
    final_grade: enrollment.finalGrade,
    certificate_issued: enrollment.certificateIssued,
    metadata: enrollment.metadata,
  };
}

// ============================================
// PROGRESS TRANSFORMERS
// ============================================

export function transformProgress(api: ApiStudentProgressResponse): StudentProgress {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    classEnrollmentId: api.class_enrollment_id,
    studentUserId: api.student_user_id,
    trackedEntityType: api.tracked_entity_type,
    trackedEntityId: api.tracked_entity_id,
    companyId: api.company_id,
    completionStatus: api.completion_status,
    progressPercentage: api.progress_percentage,
    timeSpentMinutes: api.time_spent_minutes,
    lastAccessedAt: api.last_accessed_at,
    completedAt: api.completed_at,
    score: api.score,
    metadata: api.metadata,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    // Deprecated field for backward compatibility
    enrollmentId: api.enrollment_id || api.class_enrollment_id,
  };
}

export function transformProgressList(
  api: ApiListProgressResponse
): PaginatedResponse<StudentProgress> {
  return {
    data: api.data.map(transformProgress),
    pagination: api.pagination,
  };
}

export function toApiProgress(progress: Partial<StudentProgress>): any {
  return {
    class_enrollment_id: progress.classEnrollmentId || progress.enrollmentId,
    tracked_entity_type: progress.trackedEntityType,
    tracked_entity_id: progress.trackedEntityId,
    completion_status: progress.completionStatus,
    progress_percentage: progress.progressPercentage,
    time_spent_minutes: progress.timeSpentMinutes,
    last_accessed_at: progress.lastAccessedAt,
    completed_at: progress.completedAt,
    score: progress.score,
    metadata: progress.metadata,
  };
}

// ============================================
// USER-COMPANY TRANSFORMERS
// ============================================

export function transformUserCompany(api: ApiUserCompanyResponse): UserCompany {
  return {
    // User-Company relationship
    relationshipType: api.relationship_type,
    userCompanyCreatedAt: api.user_company_created_at,

    // Company details
    companyId: api.company_id,
    legalName: api.legal_name,
    displayName: api.display_name,
    registrationNumber: api.registration_number,
    countryCode: api.country_code,
    parentId: api.parent_id,
    representativeUserId: api.representative_user_id,
    institutionalType: api.institutional_type,
    customFields: api.custom_fields,
    companyCreatedAt: api.company_created_at,
    companyUpdatedAt: api.company_updated_at,
  };
}

export function transformUserCompanies(
  api: ApiListUserCompaniesResponse
): PaginatedResponse<UserCompany> {
  return {
    data: api.data.map(transformUserCompany),
    pagination: {
      ...api.pagination,
      hasMore: api.pagination.offset + api.pagination.limit < api.pagination.total,
    },
  };
}

// ============================================
// QUESTION TRANSFORMERS
// ============================================

export function transformQuestion(api: ApiQuestionResponse): Question {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    companyId: api.company_id,
    questionBankId: api.question_bank_id,
    componentId: api.component_id,
    questionText: api.question_text,
    questionType: api.question_type,
    correctAnswer: api.correct_answer,
    options: api.options,
    points: api.points,
    tags: api.tags || [],
    difficulty: api.difficulty,
    justification: api.justification,
    actorId: api.actor_id,
    aiGenerated: api.ai_generated ?? false,
    irtDifficulty: api.irt_difficulty,
    irtDiscrimination: api.irt_discrimination,
    irtLastCalibratedAt: api.irt_last_calibrated_at,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
  };
}

export function transformQuestions(api: ApiListQuestionsResponse): PaginatedResponse<Question> {
  return {
    data: api.data.map(transformQuestion),
    pagination: api.pagination,
  };
}

export function toApiQuestion(question: Partial<Question>): any {
  const result: any = {};

  if (question.questionBankId !== undefined) result.question_bank_id = question.questionBankId;
  if (question.componentId !== undefined) result.component_id = question.componentId;
  if (question.questionText !== undefined) result.question_text = question.questionText;
  if (question.questionType !== undefined) result.question_type = question.questionType;
  if (question.correctAnswer !== undefined) result.correct_answer = question.correctAnswer;
  if (question.options !== undefined) result.options = question.options;
  if (question.points !== undefined) result.points = question.points;
  if (question.tags !== undefined) result.tags = question.tags;
  if (question.difficulty !== undefined) result.difficulty = question.difficulty;
  if (question.justification !== undefined) result.justification = question.justification;
  if (question.actorId !== undefined) result.actor_id = question.actorId;
  if (question.aiGenerated !== undefined) result.ai_generated = question.aiGenerated;
  if (question.attachments !== undefined) result.attachments = question.attachments;
  if (question.irtDifficulty !== undefined) result.irt_difficulty = question.irtDifficulty;
  if (question.irtDiscrimination !== undefined)
    result.irt_discrimination = question.irtDiscrimination;
  if (question.irtLastCalibratedAt !== undefined)
    result.irt_last_calibrated_at = question.irtLastCalibratedAt;

  return result;
}

// ============================================
// ASSESSMENT TRANSFORMERS
// ============================================

export function transformAssessment(api: ApiAssessmentResponse): Assessment {
  return {
    id: api.id,
    tenantId: api.tenant_id,
    companyId: api.company_id,
    name: api.name,
    description: api.description,
    creationMode: api.creation_mode,
    autoConfig: api.auto_config
      ? {
        tags: api.auto_config.tags,
        difficultyRatios: api.auto_config.difficulty_ratios
          ? {
            easy: api.auto_config.difficulty_ratios.easy,
            medium: api.auto_config.difficulty_ratios.medium,
            hard: api.auto_config.difficulty_ratios.hard,
          }
          : undefined,
        questionCount: api.auto_config.question_count,
        manualQuestionIds: api.auto_config.manual_question_ids,
        rubricCorrection: api.auto_config.rubric_correction || !!api.rubric_id, // Fallback to rubric_id presence
      }
      : {
        // Create autoConfig if it doesn't exist but we have a rubric_id
        rubricCorrection: !!api.rubric_id,
      },
    questionCount: api.question_count,
    createdByUserId: api.created_by_user_id,
    createdAt: api.created_at,
    updatedAt: api.updated_at,
    deletedAt: api.deleted_at,
    rubricId: api.rubric_id || null,
  };
}

export function transformAssessments(
  api: ApiListAssessmentsResponse
): PaginatedResponse<Assessment> {
  return {
    data: api.data.map(transformAssessment),
    pagination: api.pagination,
  };
}

export function toApiAssessment(assessment: Partial<Assessment>): any {
  const result: any = {};
  if (assessment.name !== undefined) result.name = assessment.name;
  if (assessment.description !== undefined) result.description = assessment.description;
  if (assessment.creationMode !== undefined) result.creation_mode = assessment.creationMode;
  if (assessment.autoConfig !== undefined && assessment.autoConfig !== null) {
    result.auto_config = {
      tags: assessment.autoConfig.tags,
      difficulty_ratios: assessment.autoConfig.difficultyRatios
        ? {
          easy: assessment.autoConfig.difficultyRatios.easy,
          medium: assessment.autoConfig.difficultyRatios.medium,
          hard: assessment.autoConfig.difficultyRatios.hard,
        }
        : undefined,
      question_count: assessment.autoConfig.questionCount,
      manual_question_ids: assessment.autoConfig.manualQuestionIds,
      rubric_correction: assessment.autoConfig.rubricCorrection,
    };
  }
  if (assessment.questionCount !== undefined) result.question_count = assessment.questionCount;
  if (assessment.rubricId !== undefined) result.rubric_id = assessment.rubricId;
  return result;
}
