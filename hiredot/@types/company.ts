export interface Company {
  id: string;
  name: string;
  locations: Location[];
}

export interface Location {
  id: string;
  name: string;
}
