import {
  App,
  Editor,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  requestUrl,
  TFile,
} from 'obsidian';

// ==================== Interfaces ====================
interface StudentActivityPluginSettings {
  apiProvider: 'openai' | 'claude' | 'gemini' | 'grok';
  apiKey: string;
  targetCharCount: number;
  outputFolder: string;
  modelId: string;
}

// ==================== Model Lists (Updated: 2025-12-14) ====================
const MODEL_OPTIONS: Record<string, { id: string; name: string }[]> = {
  openai: [
    // GPT-5 Series (Reasoning Models)
    { id: 'gpt-5', name: 'GPT-5 (Reasoning)' },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Reasoning)' },
    { id: 'gpt-5-nano', name: 'GPT-5 Nano (Reasoning)' },
    // GPT-4o Series
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    // GPT-4 Series
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-4', name: 'GPT-4' },
    // Legacy
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  ],
  claude: [
    // Claude 4.x Series (Latest)
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 (Recommended)' },
    { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    // Claude 3.7 Series
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
    // Claude 3.5 Series
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fastest)' },
    // Claude 3 Series (Legacy)
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
  ],
  gemini: [
    // Gemini 2.5 Series (Latest)
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Stable)' },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
    // Gemini 2.0 Series
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.0-flash-preview-image-generation', name: 'Gemini 2.0 Flash (Image Gen)' },
    // Gemini 1.5 Series
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B' },
  ],
  grok: [
    // Grok 4.x Series (Latest)
    { id: 'grok-4-0709', name: 'Grok 4' },
    { id: 'grok-4-1-fast', name: 'Grok 4.1 Fast (Recommended)' },
    { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast (Non-Reasoning)' },
    // Grok 3 Series
    { id: 'grok-3', name: 'Grok 3' },
    { id: 'grok-3-mini', name: 'Grok 3 Mini' },
    // Grok Code
    { id: 'grok-code-fast-1', name: 'Grok Code Fast' },
    // Grok 2 Series (Legacy)
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision' },
    { id: 'grok-2-image-1212', name: 'Grok 2 Image' },
  ],
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  claude: 'claude-sonnet-4-5-20250929',
  gemini: 'gemini-2.5-flash',
  grok: 'grok-4-1-fast',
};

interface StudentActivity {
  studentId: string;
  studentName: string;
  activityContent: string;
}

interface ObservationRecord {
  studentId: string;
  studentName: string;
  activityContent: string;
  observation: string;
  charCount: number;
  byteCount: number;
}

const DEFAULT_SETTINGS: StudentActivityPluginSettings = {
  apiProvider: 'openai',
  apiKey: '',
  targetCharCount: 300,
  outputFolder: '',
  modelId: 'gpt-4o-mini',
};

// ==================== Utility Functions ====================

/**
 * NEIS 기준 글자 수 계산 (모든 문자를 1개로 계산)
 */
function countChars(text: string): number {
  return text.length;
}

/**
 * NEIS 기준 바이트 수 계산 (NEIS_WordCount 로직 사용)
 * - 한글/한자 등: 3바이트 (escape 길이 > 4)
 * - 영문/숫자/특수문자/공백/줄바꿈: 1바이트
 */
function countBytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (char === '\n') {
      bytes += 1; // 줄바꿈
    } else if (escape(char).length > 4) {
      bytes += 3; // 한글/한자 등
    } else {
      bytes += 1; // 영문/숫자/특수문자/공백
    }
  }
  return bytes;
}

/**
 * 목표 글자수 → 예상 바이트수 계산 (한글 80% 가정)
 */
function estimateBytes(charCount: number): number {
  return Math.round(charCount * 0.8 * 3 + charCount * 0.2 * 1);
}

/**
 * 학번 패턴 확인 (5자리 숫자)
 */
function isStudentId(value: string): boolean {
  return /^\d{5}$/.test(value.trim());
}

/**
 * TSV 데이터 파싱 (탭 구분)
 * - 학번(5자리 숫자)으로 시작하는 줄만 새 학생으로 인식
 * - 그렇지 않은 줄은 이전 학생의 활동 내용에 병합
 */
function parseTSV(data: string): StudentActivity[] {
  const lines = data.trim().split('\n');
  const activities: StudentActivity[] = [];

  for (const line of lines) {
    const parts = line.split('\t').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) continue;

    // 첫 번째 필드가 5자리 학번인지 확인
    if (parts.length >= 3 && isStudentId(parts[0])) {
      // 새 학생 데이터
      activities.push({
        studentId: parts[0],
        studentName: parts[1],
        activityContent: parts.slice(2).join(' '),
      });
    } else if (activities.length > 0) {
      // 이전 학생의 활동 내용에 병합
      activities[activities.length - 1].activityContent += ' ' + parts.join(' ');
    }
    // 첫 줄이 학번으로 시작하지 않으면 무시
  }

  return activities;
}

/**
 * 가상 이름 풀 (학번/이름 없는 데이터용)
 */
const VIRTUAL_NAMES = [
  '학생A', '학생B', '학생C', '학생D', '학생E',
  '학생F', '학생G', '학생H', '학생I', '학생J',
  '학생K', '학생L', '학생M', '학생N', '학생O',
  '학생P', '학생Q', '학생R', '학생S', '학생T',
  '학생U', '학생V', '학생W', '학생X', '학생Y', '학생Z'
];

/**
 * 스마트 TSV 파싱 (다양한 입력 형식 지원)
 * - 학번(5자리 숫자)으로 시작하는 줄: 새 학생으로 인식
 * - 그렇지 않은 줄: 이전 학생 활동에 병합 또는 가상 학번/이름 생성
 */
function parseSmartTSV(data: string): StudentActivity[] {
  const lines = data.trim().split('\n');
  const activities: StudentActivity[] = [];
  let virtualIdCounter = 10001; // 5자리 학번 시작
  let virtualNameIndex = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const parts = trimmedLine.split('\t').map(p => p.trim()).filter(p => p.length > 0);
    if (parts.length === 0) continue;

    // 첫 번째 필드가 5자리 학번인지 확인
    if (isStudentId(parts[0])) {
      if (parts.length >= 3) {
        // Case 1: 완전한 형식 (학번\t이름\t활동내용)
        activities.push({
          studentId: parts[0],
          studentName: parts[1],
          activityContent: parts.slice(2).join(' '),
        });
      } else if (parts.length === 2) {
        // Case 2: 학번\t활동내용 (이름 누락)
        activities.push({
          studentId: parts[0],
          studentName: VIRTUAL_NAMES[virtualNameIndex % VIRTUAL_NAMES.length],
          activityContent: parts[1],
        });
        virtualNameIndex++;
      }
    } else if (activities.length > 0) {
      // 이전 학생의 활동 내용에 병합
      activities[activities.length - 1].activityContent += ' ' + parts.join(' ');
    } else {
      // 첫 줄부터 학번 없이 시작하는 경우: 가상 학번/이름 생성
      activities.push({
        studentId: String(virtualIdCounter++),
        studentName: VIRTUAL_NAMES[virtualNameIndex % VIRTUAL_NAMES.length],
        activityContent: parts.join(' '),
      });
      virtualNameIndex++;
    }
  }

  return activities;
}

/**
 * 마크다운 테이블 생성 (학번, 성명, 학생활동기록, 교사관찰기록, 글자 수, 바이트 수)
 */
function generateMarkdownTable(records: ObservationRecord[]): string {
  let table = '| 학번 | 성명 | 학생활동기록 | 교사관찰기록 | 글자 수 | 바이트 수 |\n';
  table += '|------|------|-------------|-------------|---------|----------|\n';

  for (const record of records) {
    const escapedActivity = record.activityContent.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const escapedObservation = record.observation.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    table += `| ${record.studentId} | ${record.studentName} | ${escapedActivity} | ${escapedObservation} | ${record.charCount} | ${record.byteCount} |\n`;
  }

  return table;
}

/**
 * 구글 스프레드시트용 TSV 데이터 생성 (탭 구분)
 */
function generateTSVData(records: ObservationRecord[]): string {
  let tsv = '학번\t성명\t학생활동기록\t교사관찰기록\t글자 수\t바이트 수\n';

  for (const record of records) {
    // 탭과 줄바꿈을 공백으로 대체하여 셀 구분 유지
    const cleanActivity = record.activityContent.replace(/[\t\n\r]/g, ' ');
    const cleanObservation = record.observation.replace(/[\t\n\r]/g, ' ');
    tsv += `${record.studentId}\t${record.studentName}\t${cleanActivity}\t${cleanObservation}\t${record.charCount}\t${record.byteCount}\n`;
  }

  return tsv;
}

// ==================== AI Service ====================

const SYSTEM_PROMPT = `당신은 학생을 깊이 이해하고 애정을 가지고 관찰하는 한국 고등학교 담임교사입니다.
학생의 활동 내용을 바탕으로 교사 관찰 기록을 작성해주세요.

[최우선 원칙 - 사실 기반 작성 (절대 준수)]
※ 이 규칙은 다른 모든 규칙보다 우선합니다.
- 입력된 학생 활동 기록에 명시된 내용만 사용하여 작성
- 학생이 실제로 수행한 활동만 기록 (추측, 상상, 허구 금지)
- 입력에 없는 활동, 성과, 역할을 절대 추가하지 않음
- 활동 내용이 짧더라도 없는 내용을 만들어내지 않음
- 글자수를 채우기 위해 허위 내용을 추가하는 것은 금지
- 입력 내용을 구체화하거나 표현을 풍부하게 하는 것은 허용
- 입력에 없는 새로운 사실을 창작하는 것은 금지

[핵심 원칙 - 대학 입학사정관 평가 기준 반영]
대학은 생활기록부를 통해 다음 역량을 평가합니다:
1. 학업역량: 학업태도, 탐구력, 지적호기심
2. 진로역량: 전공 관련 탐색 활동, 진로 탐구 경험
3. 공동체역량: 협업·소통, 나눔·배려, 리더십

※ 기재한 활동이 많다고 높게 평가하지 않습니다. 학생의 탐구력이 입증되어야 합니다.

[문체 규칙]
- 서술형 종결어미 사용: "~함", "~임", "~남", "~보임", "~드러냄"
- 제목, 머리말, 학생 이름 포함 금지
- 3인칭 관찰자 시점으로 작성 (단, 주어 생략이 자연스러움)
- 한 문단으로 자연스럽게 이어지도록 작성

[절대 금지 - 주어 사용]
※ 교사관찰기록은 교사가 학생을 관찰한 기록이므로 주어가 당연히 해당 학생임
- "학생은", "학생이", "해당 학생은" 등 '학생' 주어 사용 금지
- "학업 태도는", "탐구력은", "협업 능력은" 등 추상명사 주어 사용 금지
- 문장의 주어를 명시하지 말고, 행동/활동 중심으로 바로 서술

[올바른 문장 구조 예시]
✗ "학생은 도시 열섬현상에 관심을 갖고 탐구함" → 주어 사용 금지
✓ "도시 열섬현상에 지적 호기심을 보이며 관련 데이터를 직접 수집해 분석함"

✗ "학업 태도는 자료 분석에 몰입하며 깊이 있는 질문을 함" → 추상명사 주어 금지
✓ "자료 분석에 몰입하는 태도를 보이며 수업 중 깊이 있는 질문으로 토론을 이끎"

✗ "탐구력은 매우 우수함" → 추상명사 주어 금지
✓ "탐구 과정에서 뛰어난 분석력과 논리적 사고를 드러냄"

[내용 구성 - 탐구력 중심 서술]
단순 활동 나열이 아닌, 다음 구조로 학생의 탐구력을 입증:
1. 탐구 동기: 활동을 통해 느낀 지적호기심
2. 탐구 과정: 구체적으로 어떻게 탐구했는지 (자료 조사, 분석, 실험 등)
3. 탐구 결과: 얻은 통찰, 성장, 향후 계획

※ 학습·수업태도에 대한 언급을 포함하되, 짧고 임팩트 있게
※ 질문, 토론 역할, 리더십, 협업능력, 발표력 언급 권장

[절대 금지 - 영어 단어 사용 (가장 중요)]
※ 교사관찰기록에는 영어 알파벳이 단 한 글자도 표기되면 안 됨
※ 모든 영어 단어는 반드시 한글로 변환하여 출력

[영어 변환 규칙 - 우선순위]
1순위: 공식 한글 용어가 있으면 사용
  - AI→인공지능, VR→가상현실, AR→증강현실, IoT→사물인터넷
  - SW→소프트웨어, HW→하드웨어, IT→정보기술, PC→컴퓨터
  - PPT→발표자료, SNS→소셜미디어, USB→유에스비, CPU→중앙처리장치
  - App→앱, Web→웹, Data→데이터, Project→프로젝트, Coding→코딩
  - Algorithm→알고리즘, Program→프로그램, System→시스템
  - Design→디자인, Platform→플랫폼, Network→네트워크
  - Database→데이터베이스, Server→서버, Cloud→클라우드
  - Machine Learning→기계학습, Deep Learning→딥러닝/심층학습

2순위: 한글 의미 번역이 자연스러우면 번역
  - feedback→피드백/의견, presentation→발표, teamwork→팀워크/협업
  - leadership→리더십, portfolio→포트폴리오, mentoring→멘토링

3순위: 위 두 가지가 안 되면 영어 발음을 한글로 표기
  - ChatGPT→챗지피티, YouTube→유튜브, Google→구글
  - Figma→피그마, Notion→노션, Canva→캔바
  - Python→파이썬, JavaScript→자바스크립트, React→리액트

※ 절대로 영문 알파벳(A-Z, a-z)을 출력하지 마세요
※ 모르는 영어 단어도 반드시 한글 발음으로 변환하세요

[반드시 피해야 할 표현]
- 막연한 서술 패턴: "~이해함", "~능력을 키움", "~탐구함", "~신장함", "~발휘함"만 반복
- 활동만 나열: "발표는~, 토론에서는~, 프로젝트에서는~" 식의 단순 나열
- 모든 학생에게 적용 가능한 일반적인 표현
- 과도한 수식어나 빈 칭찬

[좋은 예시 표현 - 탐구력 입증]
- "수업 중 제기된 문제에 호기심을 느껴 관련 논문을 찾아 분석하고 보고서로 정리함"
- "모둠 프로젝트에서 팀원 의견을 조율하며 실험 설계를 주도하고 결과를 비판적으로 해석함"
- "탐구 과정에서 예상과 다른 결과가 나오자 원인을 분석하고 개선 방안을 제시함"
- "발표 후 질의응답에서 논리적으로 답변하며 심화 탐구 계획을 밝힘"

[글자수 준수 - 매우 중요]
- 목표 글자수의 ±15% 범위 내로 반드시 작성 (예: 300자 목표 시 255~345자)
- 글자수 부족 시: 입력 내용을 더 구체적으로 서술, 맥락 설명 추가, 학습 과정 상세화
- 글자수 초과 시: 중복 표현 제거, 핵심 내용 중심으로 압축
- 사실 기반 원칙 유지: 없는 활동을 만들지 않되, 입력된 내용은 충분히 상세하게 표현
- 입력 내용이 짧더라도 최소 목표의 70% 이상은 작성 (입력 내용을 풍부하게 서술)

[출력 형식]
- 추가 설명이나 머리말 없이 교사관찰기록 본문만 출력
- 자연스러운 한 문단으로 구성`;

async function callOpenAI(
  apiKey: string,
  modelId: string,
  activity: StudentActivity,
  targetCharCount: number
): Promise<string> {
  const minChars = Math.round(targetCharCount * 0.85);
  const maxChars = Math.round(targetCharCount * 1.15);

  const userPrompt = `[글자수 제약 - 반드시 준수]
- 목표: ${targetCharCount}자 (허용 범위: ${minChars}~${maxChars}자)
- ${minChars}자 미만이면 입력 내용을 더 구체적으로 서술하여 글자수 충족
- ${maxChars}자 초과하면 핵심만 남기고 압축

[작성 원칙]
- 입력된 활동 내용만 사용 (새로운 활동 창작 금지)
- 단, 입력 내용을 상세하고 풍부하게 표현하는 것은 허용

[입력]
학번: ${activity.studentId}
이름: ${activity.studentName}
활동내용: ${activity.activityContent}

[출력]
교사관찰기록 본문만 출력 (${minChars}~${maxChars}자 범위 준수)`;

  const response = await requestUrl({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (response.status !== 200) {
    throw new Error(`OpenAI API 오류: ${response.status}`);
  }

  return response.json.choices[0].message.content.trim();
}

async function callClaude(
  apiKey: string,
  modelId: string,
  activity: StudentActivity,
  targetCharCount: number
): Promise<string> {
  const minChars = Math.round(targetCharCount * 0.85);
  const maxChars = Math.round(targetCharCount * 1.15);

  const userPrompt = `[글자수 제약 - 반드시 준수]
- 목표: ${targetCharCount}자 (허용 범위: ${minChars}~${maxChars}자)
- ${minChars}자 미만이면 입력 내용을 더 구체적으로 서술하여 글자수 충족
- ${maxChars}자 초과하면 핵심만 남기고 압축

[작성 원칙]
- 입력된 활동 내용만 사용 (새로운 활동 창작 금지)
- 단, 입력 내용을 상세하고 풍부하게 표현하는 것은 허용

[입력]
학번: ${activity.studentId}
이름: ${activity.studentName}
활동내용: ${activity.activityContent}

[출력]
교사관찰기록 본문만 출력 (${minChars}~${maxChars}자 범위 준수)`;

  const response = await requestUrl({
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId || 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (response.status !== 200) {
    throw new Error(`Claude API 오류: ${response.status}`);
  }

  return response.json.content[0].text.trim();
}

async function callGemini(
  apiKey: string,
  modelId: string,
  activity: StudentActivity,
  targetCharCount: number
): Promise<string> {
  const minChars = Math.round(targetCharCount * 0.85);
  const maxChars = Math.round(targetCharCount * 1.15);

  const userPrompt = `${SYSTEM_PROMPT}

[글자수 제약 - 반드시 준수]
- 목표: ${targetCharCount}자 (허용 범위: ${minChars}~${maxChars}자)
- ${minChars}자 미만이면 입력 내용을 더 구체적으로 서술하여 글자수 충족
- ${maxChars}자 초과하면 핵심만 남기고 압축

[작성 원칙]
- 입력된 활동 내용만 사용 (새로운 활동 창작 금지)
- 단, 입력 내용을 상세하고 풍부하게 표현하는 것은 허용

[입력]
학번: ${activity.studentId}
이름: ${activity.studentName}
활동내용: ${activity.activityContent}

[출력]
교사관찰기록 본문만 출력 (${minChars}~${maxChars}자 범위 준수)`;

  const response = await requestUrl({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${modelId || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2000,
      },
    }),
  });

  if (response.status !== 200) {
    throw new Error(`Gemini API 오류: ${response.status}`);
  }

  return response.json.candidates[0].content.parts[0].text.trim();
}

async function callGrok(
  apiKey: string,
  modelId: string,
  activity: StudentActivity,
  targetCharCount: number
): Promise<string> {
  const minChars = Math.round(targetCharCount * 0.85);
  const maxChars = Math.round(targetCharCount * 1.15);

  const userPrompt = `[글자수 제약 - 반드시 준수]
- 목표: ${targetCharCount}자 (허용 범위: ${minChars}~${maxChars}자)
- ${minChars}자 미만이면 입력 내용을 더 구체적으로 서술하여 글자수 충족
- ${maxChars}자 초과하면 핵심만 남기고 압축

[작성 원칙]
- 입력된 활동 내용만 사용 (새로운 활동 창작 금지)
- 단, 입력 내용을 상세하고 풍부하게 표현하는 것은 허용

[입력]
학번: ${activity.studentId}
이름: ${activity.studentName}
활동내용: ${activity.activityContent}

[출력]
교사관찰기록 본문만 출력 (${minChars}~${maxChars}자 범위 준수)`;

  // Grok API는 OpenAI 호환 형식 사용
  const response = await requestUrl({
    url: 'https://api.x.ai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId || 'grok-3-fast',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  });

  if (response.status !== 200) {
    throw new Error(`Grok API 오류: ${response.status}`);
  }

  return response.json.choices[0].message.content.trim();
}

// ==================== Input Modal ====================

class InputModal extends Modal {
  plugin: StudentActivityPlugin;
  inputData: string = '';
  targetCharCount: number;
  onSubmit: (data: string, charCount: number) => void;

  constructor(
    app: App,
    plugin: StudentActivityPlugin,
    onSubmit: (data: string, charCount: number) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.targetCharCount = plugin.settings.targetCharCount;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('student-activity-modal');

    contentEl.createEl('h2', { text: '학생활동 → 교사관찰기록 변환' });

    // 입력 안내
    contentEl.createEl('p', {
      text: '구글 스프레드시트에서 복사한 데이터를 붙여넣으세요. (학번 탭 이름 탭 활동내용)',
      cls: 'student-activity-description',
    });

    // 텍스트 영역
    const textAreaContainer = contentEl.createDiv({ cls: 'student-activity-textarea-container' });
    const textArea = textAreaContainer.createEl('textarea', {
      cls: 'student-activity-textarea',
      attr: { rows: '10', placeholder: '10101\t김철수\t프로젝트 활동에서 리더 역할을 맡아...\n10102\t이영희\t토론 수업에서 적극적으로 참여하여...' },
    });
    textArea.addEventListener('input', (e) => {
      this.inputData = (e.target as HTMLTextAreaElement).value;
      this.updatePreview();
    });

    // 미리보기 영역
    const previewContainer = contentEl.createDiv({ cls: 'student-activity-preview' });
    previewContainer.createEl('h4', { text: '입력 데이터 미리보기' });
    const previewContent = previewContainer.createDiv({ cls: 'student-activity-preview-content' });
    previewContent.setText('데이터를 입력하면 여기에 미리보기가 표시됩니다.');

    // 글자수 설정
    const charCountContainer = contentEl.createDiv({ cls: 'student-activity-char-count' });

    new Setting(charCountContainer)
      .setName('목표 글자 수')
      .setDesc('생성될 교사관찰기록의 목표 글자 수를 설정합니다.')
      .addText((text) => {
        text
          .setValue(String(this.targetCharCount))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.targetCharCount = num;
              this.updateByteEstimate();
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '100';
        text.inputEl.max = '2000';
      });

    // 예상 바이트수 표시
    const byteEstimateEl = charCountContainer.createDiv({ cls: 'student-activity-byte-estimate' });
    byteEstimateEl.setText(`예상 바이트 수: ${estimateBytes(this.targetCharCount)} 바이트`);

    // 버튼 컨테이너
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', {
      text: '취소',
      cls: 'student-activity-cancel-btn'
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    const submitBtn = buttonContainer.createEl('button', {
      text: '교사관찰기록 생성',
      cls: 'mod-cta student-activity-submit-btn',
    });
    submitBtn.addEventListener('click', () => {
      if (!this.inputData.trim()) {
        new Notice('데이터를 입력해주세요.');
        return;
      }
      const activities = parseTSV(this.inputData);
      if (activities.length === 0) {
        new Notice('유효한 데이터가 없습니다. 형식: 학번 [탭] 이름 [탭] 활동내용');
        return;
      }
      this.onSubmit(this.inputData, this.targetCharCount);
      this.close();
    });
  }

  updatePreview() {
    const previewContent = this.contentEl.querySelector('.student-activity-preview-content');
    if (!previewContent) return;

    const activities = parseTSV(this.inputData);
    if (activities.length === 0) {
      previewContent.setText('유효한 데이터가 없습니다. 형식: 학번 탭 이름 탭 활동내용');
      return;
    }

    let preview = `총 ${activities.length}명의 학생 데이터:\n\n`;
    for (const activity of activities.slice(0, 5)) {
      preview += `- ${activity.studentId} ${activity.studentName}: ${activity.activityContent.substring(0, 50)}...\n`;
    }
    if (activities.length > 5) {
      preview += `\n... 외 ${activities.length - 5}명`;
    }

    previewContent.setText(preview);
  }

  updateByteEstimate() {
    const byteEstimateEl = this.contentEl.querySelector('.student-activity-byte-estimate');
    if (byteEstimateEl) {
      byteEstimateEl.setText(`예상 바이트 수: ${estimateBytes(this.targetCharCount)} 바이트`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== Selection Input Modal ====================

class SelectionInputModal extends Modal {
  plugin: StudentActivityPlugin;
  selectionData: string;
  targetCharCount: number;
  onSubmit: (data: string, charCount: number) => void;

  constructor(
    app: App,
    plugin: StudentActivityPlugin,
    selectionData: string,
    onSubmit: (data: string, charCount: number) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.selectionData = selectionData;
    this.targetCharCount = plugin.settings.targetCharCount;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('student-activity-modal');

    contentEl.createEl('h2', { text: '선택 영역에서 교사관찰기록 변환' });

    // 입력 안내
    contentEl.createEl('p', {
      text: '선택된 텍스트를 확인하고 필요시 수정하세요. 학번/이름이 없는 경우 자동으로 생성됩니다.',
      cls: 'student-activity-description',
    });

    // 텍스트 영역 (선택된 텍스트로 미리 채움)
    const textAreaContainer = contentEl.createDiv({ cls: 'student-activity-textarea-container' });
    const textArea = textAreaContainer.createEl('textarea', {
      cls: 'student-activity-textarea',
      attr: {
        rows: '10',
        placeholder: '활동 내용을 입력하세요...\n\n형식:\n- 학번\\t이름\\t활동내용\n- 이름\\t활동내용\n- 활동내용만'
      },
    });
    textArea.value = this.selectionData;
    textArea.addEventListener('input', (e) => {
      this.selectionData = (e.target as HTMLTextAreaElement).value;
      this.updateSmartPreview();
    });

    // 미리보기 영역
    const previewContainer = contentEl.createDiv({ cls: 'student-activity-preview' });
    previewContainer.createEl('h4', { text: '파싱 결과 미리보기' });
    const previewContent = previewContainer.createDiv({ cls: 'student-activity-preview-content' });

    // 초기 미리보기 업데이트
    this.updateSmartPreviewContent(previewContent);

    // 글자수 설정
    const charCountContainer = contentEl.createDiv({ cls: 'student-activity-char-count' });

    new Setting(charCountContainer)
      .setName('목표 글자 수')
      .setDesc('생성될 교사관찰기록의 목표 글자 수를 설정합니다.')
      .addText((text) => {
        text
          .setValue(String(this.targetCharCount))
          .onChange((value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.targetCharCount = num;
              this.updateByteEstimate();
            }
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '100';
        text.inputEl.max = '2000';
      });

    // 예상 바이트수 표시
    const byteEstimateEl = charCountContainer.createDiv({ cls: 'student-activity-byte-estimate' });
    byteEstimateEl.setText(`예상 바이트 수: ${estimateBytes(this.targetCharCount)} 바이트`);

    // 버튼 컨테이너
    const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonContainer.createEl('button', {
      text: '취소',
      cls: 'student-activity-cancel-btn'
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    const submitBtn = buttonContainer.createEl('button', {
      text: '교사관찰기록 생성',
      cls: 'mod-cta student-activity-submit-btn',
    });
    submitBtn.addEventListener('click', () => {
      if (!this.selectionData.trim()) {
        new Notice('데이터를 입력해주세요.');
        return;
      }
      const activities = parseSmartTSV(this.selectionData);
      if (activities.length === 0) {
        new Notice('유효한 데이터가 없습니다.');
        return;
      }
      this.onSubmit(this.selectionData, this.targetCharCount);
      this.close();
    });
  }

  updateSmartPreview() {
    const previewContent = this.contentEl.querySelector('.student-activity-preview-content');
    if (!previewContent) return;
    this.updateSmartPreviewContent(previewContent as HTMLElement);
  }

  updateSmartPreviewContent(previewContent: HTMLElement) {
    const activities = parseSmartTSV(this.selectionData);
    if (activities.length === 0) {
      previewContent.setText('유효한 데이터가 없습니다.');
      return;
    }

    // 가상 데이터 여부 확인
    let hasVirtualData = false;
    for (const activity of activities) {
      if (activity.studentId.match(/^1000[1-9]$|^100[1-2][0-9]$|^1003[0-9]$/) ||
          activity.studentName.match(/^학생[A-Z]$/)) {
        hasVirtualData = true;
        break;
      }
    }

    let preview = `총 ${activities.length}명의 학생 데이터:\n\n`;
    for (const activity of activities.slice(0, 5)) {
      const contentPreview = activity.activityContent.length > 40
        ? activity.activityContent.substring(0, 40) + '...'
        : activity.activityContent;
      preview += `- ${activity.studentId} ${activity.studentName}: ${contentPreview}\n`;
    }
    if (activities.length > 5) {
      preview += `\n... 외 ${activities.length - 5}명`;
    }
    if (hasVirtualData) {
      preview += '\n\n※ 학번/이름이 없는 항목은 자동 생성되었습니다.';
    }

    previewContent.setText(preview);
  }

  updateByteEstimate() {
    const byteEstimateEl = this.contentEl.querySelector('.student-activity-byte-estimate');
    if (byteEstimateEl) {
      byteEstimateEl.setText(`예상 바이트 수: ${estimateBytes(this.targetCharCount)} 바이트`);
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== Progress Modal ====================

class ProgressModal extends Modal {
  progressText: HTMLElement | null = null;
  progressBar: HTMLElement | null = null;
  progressBarFill: HTMLElement | null = null;
  progressPercentText: HTMLElement | null = null;
  statusText: HTMLElement | null = null;
  studentListContainer: HTMLElement | null = null;
  currentIndex: number = 0;
  totalCount: number = 0;
  completedStudents: string[] = [];
  previousStudentName: string = '';

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('student-activity-progress-modal');

    // 헤더 영역
    const headerDiv = contentEl.createDiv({ cls: 'progress-header' });
    const iconSpan = headerDiv.createSpan({ cls: 'progress-icon' });
    iconSpan.innerHTML = '✨';
    headerDiv.createEl('h2', { text: '교사관찰기록 생성 중' });

    // 현재 처리 중인 학생 정보 (강조)
    this.progressText = contentEl.createEl('p', { cls: 'progress-text' });
    this.progressText.setText('AI 변환 준비 중...');

    // 프로그레스 바 컨테이너 (원형 퍼센트 포함)
    const progressWrapper = contentEl.createDiv({ cls: 'progress-wrapper' });

    // 원형 프로그레스 표시
    const circleContainer = progressWrapper.createDiv({ cls: 'progress-circle-container' });
    this.progressPercentText = circleContainer.createDiv({ cls: 'progress-circle' });
    this.progressPercentText.setText('0%');

    // 바형 프로그레스
    const barSection = progressWrapper.createDiv({ cls: 'progress-bar-section' });
    const progressBarContainer = barSection.createDiv({ cls: 'progress-bar-container' });
    this.progressBar = progressBarContainer.createDiv({ cls: 'progress-bar-bg' });
    this.progressBarFill = this.progressBar.createDiv({ cls: 'progress-bar-fill' });
    this.progressBarFill.style.width = '0%';

    // 진행 단계 표시
    this.statusText = barSection.createEl('p', { cls: 'progress-status' });
    this.statusText.setText('잠시만 기다려주세요...');

    // 완료된 학생 목록 (스크롤 가능)
    const listSection = contentEl.createDiv({ cls: 'progress-list-section' });
    listSection.createEl('h4', { text: '📝 변환 완료' });
    this.studentListContainer = listSection.createDiv({ cls: 'progress-student-list' });

    // 안내 메시지
    const infoText = contentEl.createEl('p', { cls: 'progress-info' });
    infoText.innerHTML = '🤖 AI가 학생활동 내용을 <strong>교사관찰기록 문체</strong>로 변환하고 있습니다.';
  }

  updateProgress(current: number, total: number, studentName: string) {
    this.currentIndex = current;
    this.totalCount = total;
    const percentage = Math.round((current / total) * 100);

    if (this.progressText) {
      this.progressText.innerHTML = `<span class="current-student">🎯 ${studentName}</span> 변환 중... <span class="progress-count">(${current}/${total}명)</span>`;
    }
    if (this.progressBarFill) {
      this.progressBarFill.style.width = `${percentage}%`;
      // 동적 색상 변화
      if (percentage < 30) {
        this.progressBarFill.style.background = 'linear-gradient(90deg, #ff6b6b, #ffa502)';
      } else if (percentage < 70) {
        this.progressBarFill.style.background = 'linear-gradient(90deg, #ffa502, #2ed573)';
      } else {
        this.progressBarFill.style.background = 'linear-gradient(90deg, #2ed573, #1e90ff)';
      }
    }
    if (this.progressPercentText) {
      this.progressPercentText.setText(`${percentage}%`);
      this.progressPercentText.style.background = `conic-gradient(var(--interactive-accent) ${percentage * 3.6}deg, var(--background-modifier-border) 0deg)`;
    }
    if (this.statusText) {
      if (current === total) {
        this.statusText.innerHTML = '✅ 변환 완료! 결과를 저장하고 있습니다...';
      } else {
        const remaining = total - current;
        const estimatedTime = remaining * 2; // 약 2초/명 예상
        this.statusText.innerHTML = `⏳ 남은 학생: <strong>${remaining}명</strong> (예상 ${estimatedTime}초)`;
      }
    }

    // 이전 학생이 완료되었으므로 이전 학생 이름을 목록에 추가
    if (this.previousStudentName && this.studentListContainer) {
      const studentTag = this.studentListContainer.createSpan({ cls: 'completed-student-tag' });
      studentTag.setText(`✓ ${this.previousStudentName}`);
      // 스크롤을 최신 항목으로
      this.studentListContainer.scrollTop = this.studentListContainer.scrollHeight;
    }
    // 현재 학생 이름 저장 (다음 호출 시 완료 처리용)
    this.previousStudentName = studentName;
  }

  // 마지막 학생 완료 처리
  markLastStudentComplete() {
    if (this.previousStudentName && this.studentListContainer) {
      const studentTag = this.studentListContainer.createSpan({ cls: 'completed-student-tag' });
      studentTag.setText(`✓ ${this.previousStudentName}`);
      this.studentListContainer.scrollTop = this.studentListContainer.scrollHeight;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ==================== Settings Tab ====================

class StudentActivitySettingTab extends PluginSettingTab {
  plugin: StudentActivityPlugin;
  modelDropdown: any = null;

  constructor(app: App, plugin: StudentActivityPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getProviderName(provider: string): string {
    const names: Record<string, string> = {
      openai: 'OpenAI',
      claude: 'Anthropic',
      gemini: 'Google',
      grok: 'xAI',
    };
    return names[provider] || provider;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h1', { text: '학생활동 → 교사관찰기록 변환 설정' });

    // API 제공자 선택
    new Setting(containerEl)
      .setName('AI 제공자')
      .setDesc('사용할 AI API 제공자를 선택합니다.')
      .addDropdown((dropdown) => {
        dropdown.addOption('openai', 'OpenAI (GPT)');
        dropdown.addOption('claude', 'Anthropic (Claude)');
        dropdown.addOption('gemini', 'Google (Gemini)');
        dropdown.addOption('grok', 'xAI (Grok)');
        dropdown.setValue(this.plugin.settings.apiProvider);
        dropdown.onChange(async (value) => {
          this.plugin.settings.apiProvider = value as 'openai' | 'claude' | 'gemini' | 'grok';
          // 제공자 변경 시 기본 모델로 설정
          this.plugin.settings.modelId = DEFAULT_MODELS[value];
          await this.plugin.saveSettings();
          this.display(); // 설정 화면 새로고침
        });
      });

    // API 키
    const apiKeyPlaceholders: Record<string, string> = {
      openai: 'sk-...',
      claude: 'sk-ant-...',
      gemini: 'AIza...',
      grok: 'xai-...',
    };

    new Setting(containerEl)
      .setName('API 키')
      .setDesc(`${this.getProviderName(this.plugin.settings.apiProvider)} API 키를 입력합니다.`)
      .addText((text) =>
        text
          .setPlaceholder(apiKeyPlaceholders[this.plugin.settings.apiProvider] || 'API 키')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    // 모델 ID (드롭다운)
    const currentProvider = this.plugin.settings.apiProvider;
    const models = MODEL_OPTIONS[currentProvider] || [];

    new Setting(containerEl)
      .setName('모델')
      .setDesc(`${this.getProviderName(currentProvider)}에서 사용할 AI 모델을 선택합니다.`)
      .addDropdown((dropdown) => {
        this.modelDropdown = dropdown;
        for (const model of models) {
          dropdown.addOption(model.id, model.name);
        }
        // 현재 설정된 모델이 목록에 있는지 확인
        const modelExists = models.some(m => m.id === this.plugin.settings.modelId);
        if (modelExists) {
          dropdown.setValue(this.plugin.settings.modelId);
        } else {
          // 목록에 없으면 기본 모델로 설정
          dropdown.setValue(DEFAULT_MODELS[currentProvider]);
          this.plugin.settings.modelId = DEFAULT_MODELS[currentProvider];
          this.plugin.saveSettings();
        }
        dropdown.onChange(async (value) => {
          this.plugin.settings.modelId = value;
          await this.plugin.saveSettings();
        });
      });

    // 기본 글자 수
    new Setting(containerEl)
      .setName('기본 목표 글자 수')
      .setDesc('교사관찰기록의 기본 목표 글자 수를 설정합니다.')
      .addText((text) => {
        text
          .setPlaceholder('300')
          .setValue(String(this.plugin.settings.targetCharCount))
          .onChange(async (value) => {
            const num = parseInt(value);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.targetCharCount = num;
              await this.plugin.saveSettings();
            }
          });
        text.inputEl.type = 'number';
      });

    // 출력 폴더
    new Setting(containerEl)
      .setName('결과 저장 폴더')
      .setDesc('변환 결과를 저장할 폴더 경로 (비워두면 Vault 루트에 저장)')
      .addText((text) =>
        text
          .setPlaceholder('교사관찰기록')
          .setValue(this.plugin.settings.outputFolder)
          .onChange(async (value) => {
            this.plugin.settings.outputFolder = value;
            await this.plugin.saveSettings();
          })
      );

    // NEIS 글자수/바이트수 안내
    containerEl.createEl('h2', { text: 'NEIS 글자수/바이트수 계산 기준' });
    const infoDiv = containerEl.createDiv({ cls: 'student-activity-info' });
    infoDiv.innerHTML = `
      <ul>
        <li><strong>글자 수</strong>: 모든 문자를 1개로 계산 (한글, 영문, 숫자, 공백, 특수문자)</li>
        <li><strong>바이트 수</strong>:
          <ul>
            <li>한글, 한자: 3바이트</li>
            <li>영문, 숫자, 특수문자, 공백, 줄바꿈: 1바이트</li>
          </ul>
        </li>
      </ul>
    `;
  }
}

// ==================== Main Plugin Class ====================

export default class StudentActivityPlugin extends Plugin {
  settings: StudentActivityPluginSettings;

  async onload(): Promise<void> {
    console.log('Loading Student Activity to Observation Plugin');

    await this.loadSettings();

    this.addSettingTab(new StudentActivitySettingTab(this.app, this));

    // 커맨드: Modal 열기
    this.addCommand({
      id: 'open-conversion-modal',
      name: '학생활동 → 교사관찰기록 변환 (Modal)',
      callback: () => {
        this.openConversionModal();
      },
    });

    // 커맨드: 선택 영역에서 변환 (Modal 사용, 스마트 파싱)
    this.addCommand({
      id: 'convert-from-selection',
      name: '선택 영역에서 교사관찰기록 변환',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const selection = editor.getSelection();
        if (!selection.trim()) {
          new Notice('텍스트를 선택해주세요.');
          return;
        }
        if (!this.settings.apiKey) {
          new Notice('API 키를 설정해주세요. (설정 → 학생활동 → 교사관찰기록 변환)');
          return;
        }
        // Modal을 열어서 미리보기 및 글자수 조정 가능하게
        new SelectionInputModal(this.app, this, selection, (data, charCount) => {
          this.processConversionSmart(data, charCount);
        }).open();
      },
    });

    // 파일 메뉴 추가
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        menu.addItem((item) => {
          item
            .setTitle('학생활동 → 교사관찰기록 변환')
            .setIcon('file-text')
            .onClick(() => {
              this.openConversionModal();
            });
        });
      })
    );
  }

  async onunload(): Promise<void> {
    console.log('Unloading Student Activity to Observation Plugin');
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  openConversionModal() {
    if (!this.settings.apiKey) {
      new Notice('API 키를 설정해주세요. (설정 → 학생활동 → 교사관찰기록 변환)');
      return;
    }

    new InputModal(this.app, this, (data, charCount) => {
      this.processConversion(data, charCount);
    }).open();
  }

  /**
   * AI API 호출 (제공자별 분기)
   */
  private async callAI(activity: StudentActivity, targetCharCount: number): Promise<string> {
    const { apiKey, apiProvider, modelId } = this.settings;

    switch (apiProvider) {
      case 'openai':
        return callOpenAI(apiKey, modelId || DEFAULT_MODELS.openai, activity, targetCharCount);
      case 'claude':
        return callClaude(apiKey, modelId || DEFAULT_MODELS.claude, activity, targetCharCount);
      case 'gemini':
        return callGemini(apiKey, modelId || DEFAULT_MODELS.gemini, activity, targetCharCount);
      case 'grok':
        return callGrok(apiKey, modelId || DEFAULT_MODELS.grok, activity, targetCharCount);
      default:
        throw new Error(`지원하지 않는 AI 제공자: ${apiProvider}`);
    }
  }

  /**
   * 공통 변환 처리 로직
   */
  private async processActivities(activities: StudentActivity[], targetCharCount: number): Promise<void> {
    if (activities.length === 0) {
      new Notice('변환할 데이터가 없습니다.');
      return;
    }

    const progressModal = new ProgressModal(this.app);
    progressModal.open();

    const records: ObservationRecord[] = [];
    let errorCount = 0;

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      progressModal.updateProgress(i + 1, activities.length, activity.studentName);

      try {
        const observation = await this.callAI(activity, targetCharCount);
        records.push({
          studentId: activity.studentId,
          studentName: activity.studentName,
          activityContent: activity.activityContent,
          observation,
          charCount: countChars(observation),
          byteCount: countBytes(observation),
        });
      } catch (error) {
        console.error(`Error processing ${activity.studentName}:`, error);
        errorCount++;
        records.push({
          studentId: activity.studentId,
          studentName: activity.studentName,
          activityContent: activity.activityContent,
          observation: `[변환 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}]`,
          charCount: 0,
          byteCount: 0,
        });
      }

      // API 호출 간 딜레이 (rate limit 방지)
      if (i < activities.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    progressModal.markLastStudentComplete();
    progressModal.close();

    await this.createResultNote(records);

    if (errorCount > 0) {
      new Notice(`변환 완료! (${records.length - errorCount}명 성공, ${errorCount}명 실패)`);
    } else {
      new Notice(`${records.length}명의 교사관찰기록 변환 완료!`);
    }
  }

  async processConversion(data: string, targetCharCount: number): Promise<void> {
    await this.processActivities(parseTSV(data), targetCharCount);
  }

  async processConversionSmart(data: string, targetCharCount: number): Promise<void> {
    await this.processActivities(parseSmartTSV(data), targetCharCount);
  }

  async createResultNote(records: ObservationRecord[]) {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '');

    const fileName = `교사관찰기록_${dateStr}_${timeStr}.md`;
    let filePath = fileName;

    if (this.settings.outputFolder) {
      const folder = this.app.vault.getAbstractFileByPath(this.settings.outputFolder);
      if (!folder) {
        await this.app.vault.createFolder(this.settings.outputFolder);
      }
      filePath = `${this.settings.outputFolder}/${fileName}`;
    }

    // TSV 데이터를 base64로 인코딩
    const tsvData = generateTSVData(records);
    const encodedTSV = Buffer.from(tsvData).toString('base64');

    // 통계 계산
    const successRecords = records.filter(r => r.charCount > 0);
    const failedRecords = records.filter(r => r.charCount === 0);
    const avgChars = successRecords.length > 0
      ? Math.round(successRecords.reduce((sum, r) => sum + r.charCount, 0) / successRecords.length)
      : 0;
    const avgBytes = successRecords.length > 0
      ? Math.round(successRecords.reduce((sum, r) => sum + r.byteCount, 0) / successRecords.length)
      : 0;
    const minChars = successRecords.length > 0 ? Math.min(...successRecords.map(r => r.charCount)) : 0;
    const maxChars = successRecords.length > 0 ? Math.max(...successRecords.map(r => r.charCount)) : 0;

    // 개별 학생 카드 생성
    const studentCards = records.map((r, idx) => {
      const statusIcon = r.charCount > 0 ? '✅' : '❌';
      const statusClass = r.charCount > 0 ? 'success' : 'failed';
      return `
<div class="sa-student-card ${statusClass}" data-student-index="${idx}">
<div class="sa-card-header">
<input type="checkbox" class="sa-card-checkbox" data-checkbox-index="${idx}" />
<span class="sa-card-number">${idx + 1}</span>
<span class="sa-card-id">${r.studentId}</span>
<span class="sa-card-name">${r.studentName}</span>
<span class="sa-card-status">${statusIcon}</span>
<button class="sa-card-print-btn" data-print-index="${idx}">🖨️ 출력</button>
</div>
<div class="sa-card-section">
<div class="sa-card-label">📝 학생활동기록</div>
<div class="sa-card-content activity">${r.activityContent}</div>
</div>
<div class="sa-card-section">
<div class="sa-card-label">📋 교사관찰기록</div>
<div class="sa-card-content observation">${r.observation}</div>
</div>
<div class="sa-card-footer">
<span class="sa-card-stat">📊 ${r.charCount}자</span>
<span class="sa-card-stat">💾 ${r.byteCount}바이트</span>
</div>
</div>`;
    }).join('\n');

    const content = `---
title: 교사관찰기록 변환 결과
created: ${dateStr}
type: 교사관찰기록
students: ${records.length}
ai_provider: ${this.settings.apiProvider}
model: ${this.settings.modelId}
---

<div class="sa-result-container">

# ✨ 교사관찰기록 변환 결과

<div class="sa-meta-section">
<div class="sa-meta-item">
<span class="sa-meta-icon">📅</span>
<span class="sa-meta-label">생성일시</span>
<span class="sa-meta-value">${now.toLocaleString('ko-KR')}</span>
</div>
<div class="sa-meta-item">
<span class="sa-meta-icon">🤖</span>
<span class="sa-meta-label">AI 모델</span>
<span class="sa-meta-value">${this.settings.apiProvider.toUpperCase()} / ${this.settings.modelId}</span>
</div>
<div class="sa-meta-item">
<span class="sa-meta-icon">🎯</span>
<span class="sa-meta-label">목표 글자수</span>
<span class="sa-meta-value">${this.settings.targetCharCount}자</span>
</div>
</div>

---

## 📊 변환 통계

<div class="sa-stats-grid">
<div class="sa-stat-card primary">
<div class="sa-stat-icon">👥</div>
<div class="sa-stat-value">${records.length}명</div>
<div class="sa-stat-label">총 인원</div>
</div>
<div class="sa-stat-card success">
<div class="sa-stat-icon">✅</div>
<div class="sa-stat-value">${successRecords.length}명</div>
<div class="sa-stat-label">변환 성공</div>
</div>
${failedRecords.length > 0 ? `<div class="sa-stat-card error">
<div class="sa-stat-icon">❌</div>
<div class="sa-stat-value">${failedRecords.length}명</div>
<div class="sa-stat-label">변환 실패</div>
</div>` : ''}
<div class="sa-stat-card info">
<div class="sa-stat-icon">📝</div>
<div class="sa-stat-value">${avgChars}자</div>
<div class="sa-stat-label">평균 글자수</div>
</div>
<div class="sa-stat-card info">
<div class="sa-stat-icon">💾</div>
<div class="sa-stat-value">${avgBytes}</div>
<div class="sa-stat-label">평균 바이트</div>
</div>
<div class="sa-stat-card">
<div class="sa-stat-icon">📉</div>
<div class="sa-stat-value">${minChars}~${maxChars}</div>
<div class="sa-stat-label">글자수 범위</div>
</div>
</div>

---

## 📋 구글 스프레드시트로 복사

<div class="sa-copy-section">
<button class="student-activity-copy-btn" data-tsv="${encodedTSV}">
📋 클릭하여 클립보드에 복사
</button>
<p class="sa-copy-hint">복사 후 구글 스프레드시트에서 <kbd>Ctrl</kbd>+<kbd>V</kbd>로 붙여넣기</p>
</div>

---

## 🖨️ 출력하기

<div class="sa-print-section">
<button class="sa-select-btn" data-select-all="true">☑️ 전체 선택</button>
<button class="sa-select-btn" data-select-all="false">☐ 전체 해제</button>
<button class="sa-print-btn print-selected" data-print-selected="true">🖨️ 선택 출력</button>
<button class="sa-print-btn print-all" data-print-all="true">🖨️ 전체 출력</button>
</div>
<p class="sa-print-hint">💡 학생 카드의 체크박스를 선택한 후 '선택 출력'을 클릭하세요</p>

---

## 📑 변환 결과 상세

${studentCards}

---

## 📋 결과 테이블

${generateMarkdownTable(records)}

</div>
`;

    const file = await this.app.vault.create(filePath, content);

    // 생성된 파일 열기
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);

    // 복사 버튼 이벤트 등록
    this.registerCopyButtonHandler();
  }

  registerCopyButtonHandler() {
    // DOM이 준비될 때까지 약간의 딜레이
    setTimeout(() => {
      // 복사 버튼 핸들러
      const copyButtons = document.querySelectorAll('.student-activity-copy-btn');
      copyButtons.forEach((btn) => {
        if (btn.hasAttribute('data-listener-attached')) return;
        btn.setAttribute('data-listener-attached', 'true');

        btn.addEventListener('click', async (e) => {
          const button = e.target as HTMLElement;
          const encodedTSV = button.getAttribute('data-tsv');
          if (!encodedTSV) return;

          try {
            const tsvData = Buffer.from(encodedTSV, 'base64').toString('utf-8');
            await navigator.clipboard.writeText(tsvData);

            // 버튼 상태 변경
            const originalText = button.textContent;
            button.textContent = '✅ 복사 완료!';
            button.classList.add('copied');

            new Notice('📋 클립보드에 복사되었습니다! 구글 스프레드시트에 붙여넣기(Ctrl+V)하세요.');

            setTimeout(() => {
              button.textContent = originalText;
              button.classList.remove('copied');
            }, 2000);
          } catch (error) {
            new Notice('복사 실패: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
          }
        });
      });

      // 개별 출력 버튼 핸들러
      const printButtons = document.querySelectorAll('.sa-card-print-btn');
      printButtons.forEach((btn) => {
        if (btn.hasAttribute('data-listener-attached')) return;
        btn.setAttribute('data-listener-attached', 'true');

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const button = e.currentTarget as HTMLElement;
          const printIndex = button.getAttribute('data-print-index');
          if (printIndex === null) return;

          this.printIndividualStudent(parseInt(printIndex));
        });
      });

      // 전체 출력 버튼 핸들러
      const printAllButtons = document.querySelectorAll('.sa-print-btn.print-all');
      printAllButtons.forEach((btn) => {
        if (btn.hasAttribute('data-listener-attached')) return;
        btn.setAttribute('data-listener-attached', 'true');

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.printAllStudents();
        });
      });

      // 선택 출력 버튼 핸들러
      const printSelectedButtons = document.querySelectorAll('.sa-print-btn.print-selected');
      printSelectedButtons.forEach((btn) => {
        if (btn.hasAttribute('data-listener-attached')) return;
        btn.setAttribute('data-listener-attached', 'true');

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.printSelectedStudents();
        });
      });

      // 전체 선택/해제 버튼 핸들러
      const selectButtons = document.querySelectorAll('.sa-select-btn');
      selectButtons.forEach((btn) => {
        if (btn.hasAttribute('data-listener-attached')) return;
        btn.setAttribute('data-listener-attached', 'true');

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const button = e.currentTarget as HTMLElement;
          const selectAll = button.getAttribute('data-select-all') === 'true';
          this.toggleAllCheckboxes(selectAll);
        });
      });
    }, 500);
  }

  /**
   * 개별 학생 출력
   */
  printIndividualStudent(studentIndex: number) {
    const container = document.querySelector('.sa-result-container');
    if (!container) {
      new Notice('출력할 내용을 찾을 수 없습니다.');
      return;
    }

    // 모든 카드에서 print-target 클래스 제거
    const allCards = container.querySelectorAll('.sa-student-card');
    allCards.forEach(card => card.classList.remove('print-target'));

    // 선택한 카드에 print-target 클래스 추가
    const targetCard = container.querySelector(`.sa-student-card[data-student-index="${studentIndex}"]`);
    if (targetCard) {
      targetCard.classList.add('print-target');
    }

    // 컨테이너에 print-individual 클래스 추가
    container.classList.remove('print-all');
    container.classList.add('print-individual');

    // 학생 이름 가져오기
    const studentName = targetCard?.querySelector('.sa-card-name')?.textContent || '학생';
    new Notice(`🖨️ ${studentName} 교사관찰기록 출력 중...`);

    // 약간의 딜레이 후 출력
    setTimeout(() => {
      window.print();

      // 출력 후 클래스 정리
      setTimeout(() => {
        container.classList.remove('print-individual');
        allCards.forEach(card => card.classList.remove('print-target'));
      }, 1000);
    }, 100);
  }

  /**
   * 전체 학생 출력 (교사용)
   */
  printAllStudents() {
    const container = document.querySelector('.sa-result-container');
    if (!container) {
      new Notice('출력할 내용을 찾을 수 없습니다.');
      return;
    }

    // 컨테이너에 print-all 클래스 추가
    container.classList.remove('print-individual', 'print-selected');
    container.classList.add('print-all');

    new Notice('🖨️ 전체 교사관찰기록 출력 중...');

    // 약간의 딜레이 후 출력
    setTimeout(() => {
      window.print();

      // 출력 후 클래스 정리
      setTimeout(() => {
        container.classList.remove('print-all');
      }, 1000);
    }, 100);
  }

  /**
   * 체크박스 전체 선택/해제
   */
  toggleAllCheckboxes(selectAll: boolean) {
    const checkboxes = document.querySelectorAll('.sa-card-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach((checkbox) => {
      checkbox.checked = selectAll;
    });

    const count = selectAll ? checkboxes.length : 0;
    new Notice(selectAll ? `☑️ ${count}명 전체 선택됨` : '☐ 전체 선택 해제됨');
  }

  /**
   * 선택된 학생들 출력
   */
  printSelectedStudents() {
    const container = document.querySelector('.sa-result-container');
    if (!container) {
      new Notice('출력할 내용을 찾을 수 없습니다.');
      return;
    }

    // 선택된 체크박스 찾기
    const checkboxes = document.querySelectorAll('.sa-card-checkbox:checked') as NodeListOf<HTMLInputElement>;
    if (checkboxes.length === 0) {
      new Notice('⚠️ 출력할 학생을 선택해주세요.');
      return;
    }

    // 모든 카드에서 print-target 클래스 제거
    const allCards = container.querySelectorAll('.sa-student-card');
    allCards.forEach(card => card.classList.remove('print-target'));

    // 선택된 카드에 print-target 클래스 추가
    const selectedNames: string[] = [];
    checkboxes.forEach((checkbox) => {
      const index = checkbox.getAttribute('data-checkbox-index');
      if (index !== null) {
        const card = container.querySelector(`.sa-student-card[data-student-index="${index}"]`);
        if (card) {
          card.classList.add('print-target');
          const name = card.querySelector('.sa-card-name')?.textContent;
          if (name) selectedNames.push(name);
        }
      }
    });

    // 컨테이너에 print-selected 클래스 추가
    container.classList.remove('print-all', 'print-individual');
    container.classList.add('print-selected');

    new Notice(`🖨️ ${checkboxes.length}명 선택 출력 중...`);

    // 약간의 딜레이 후 출력
    setTimeout(() => {
      window.print();

      // 출력 후 클래스 정리
      setTimeout(() => {
        container.classList.remove('print-selected');
        allCards.forEach(card => card.classList.remove('print-target'));
      }, 1000);
    }, 100);
  }
}
