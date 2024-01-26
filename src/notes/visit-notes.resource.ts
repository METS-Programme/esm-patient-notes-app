import useSWR from "swr";
import { map } from "rxjs/operators";
import {
  openmrsFetch,
  openmrsObservableFetch,
  useConfig,
} from "@openmrs/esm-framework";
import {
  type EncountersFetchResponse,
  type RESTPatientNote,
  type PatientNote,
  type VisitNotePayload,
  type DiagnosisPayload,
  type Concept,
} from "../types";

interface UseVisitNotes {
  visitNotes: Array<PatientNote> | null;
  isError: Error;
  isLoading: boolean;
  isValidating?: boolean;
  mutateVisitNotes: () => void;
}

export interface ConceptAnswer {
  uuid: string;
  name: string;
  display: string;
}

interface ConceptAnswersResponse {
  answers?: Array<ConceptAnswer>;
}

export function useVisitNotes(patientUuid: string): UseVisitNotes {
  const {
    visitNoteConfig: {
      encounterNoteTextConceptUuid,
      visitDiagnosesConceptUuid,
    },
  } = useConfig();

  const customRepresentation =
    "custom:(uuid,display,encounterDatetime,patient,obs," +
    "encounterProviders:(uuid,display," +
    "encounterRole:(uuid,display)," +
    "provider:(uuid,person:(uuid,display)))," +
    "diagnoses";
  const encountersApiUrl = `/ws/rest/v1/encounter?patient=${patientUuid}&obs=${visitDiagnosesConceptUuid}&v=${customRepresentation}`;

  const { data, error, isLoading, isValidating, mutate } = useSWR<
    { data: EncountersFetchResponse },
    Error
  >(encountersApiUrl, openmrsFetch);

  const mapNoteProperties = (
    note: RESTPatientNote,
    index: number
  ): PatientNote => ({
    id: `${index}`,
    diagnoses: note.diagnoses
      .map((diagnosisData) => diagnosisData.display)
      .filter((val) => val)
      .join(", "),
    encounterDate: note.encounterDatetime,
    encounterNote: note.obs.find(
      (observation) => observation.concept.uuid === encounterNoteTextConceptUuid
    )?.value,
    encounterNoteRecordedAt: note.obs.find(
      (observation) => observation.concept.uuid === encounterNoteTextConceptUuid
    )?.obsDatetime,
    encounterProvider: note?.encounterProviders[0]?.provider?.person?.display,
    encounterProviderRole: note?.encounterProviders[0]?.encounterRole?.display,
  });

  const formattedVisitNotes = data?.data?.results
    ?.map(mapNoteProperties)
    ?.sort(
      (noteA, noteB) =>
        new Date(noteB.encounterDate).getTime() -
        new Date(noteA.encounterDate).getTime()
    );

  return {
    visitNotes: data ? formattedVisitNotes : null,
    isError: error,
    isLoading,
    isValidating,
    mutateVisitNotes: mutate,
  };
}

export function fetchConceptDiagnosisByName(searchTerm: string) {
  return openmrsObservableFetch<Array<Concept>>(
    `/ws/rest/v1/concept?q=${searchTerm}&searchType=fuzzy&class=8d4918b0-c2cc-11de-8d13-0010c6dffd0f&q=&v=custom:(uuid,display)`
  ).pipe(map(({ data }) => data["results"]));
}

export function saveVisitNote(
  abortController: AbortController,
  payload: VisitNotePayload
) {
  return openmrsFetch(`/ws/rest/v1/encounter`, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: payload,
    signal: abortController.signal,
  });
}

export function savePatientDiagnosis(
  abortController: AbortController,
  payload: DiagnosisPayload
) {
  return openmrsFetch(`/ws/rest/v1/patientdiagnoses`, {
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    body: payload,
  });
}

export function extractDate(timestamp: string): string {
  const dateObject = new Date(timestamp);
  const year = dateObject.getFullYear();
  const month = (dateObject.getMonth() + 1).toString().padStart(2, "0");
  const day = dateObject.getDate().toString().padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function useConceptAnswers(conceptUuid: string) {
  const { data, error, isLoading, isValidating } = useSWR<
    { data: ConceptAnswersResponse },
    Error
  >(
    `/ws/rest/v1/concept/${conceptUuid}`,
    (url) => (conceptUuid ? openmrsFetch(url) : undefined),
    {
      shouldRetryOnError(err) {
        return err instanceof Response && err.status !== 404;
      },
    }
  );

  const conceptDisplays =
    data?.data?.answers?.map((answer) => answer.display) ?? [];

  return {
    conceptAnswers: conceptDisplays,
    isConceptLoading: isLoading,
    conceptError: error,
    isConceptAnswerValidating: isValidating,
  };
}
